import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Player-controlled stationary gun turret.
export class Turret {
  constructor(scene, camera, cameraRig, renderer) {
    this._scene      = scene;
    this._camera     = camera;
    this._cameraRig  = cameraRig;
    this._renderer   = renderer;
    this._raycaster  = new THREE.Raycaster();

    this._build();
    this._buildVRCrosshair();
  }

  // ── Build gun model ───────────────────────────────────────────
  _build() {
    this._group = new THREE.Group();
    this._group.position.set(0, 0.55, 1.2); // sits on platform

    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
    const midMat  = new THREE.MeshLambertMaterial({ color: 0x445566 });
    const lightMat = new THREE.MeshLambertMaterial({ color: 0x667788 });

    // Base swivel
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.35, 0.35, 10),
      darkMat
    );
    this._group.add(base);

    // Barrel pivot (child of group – rotates to aim)
    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    // Main barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.08, 1.6, 8),
      lightMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.8;
    this._barrelPivot.add(barrel);

    // Muzzle detail ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.02, 6, 12),
      midMat
    );
    ring.position.z = 1.55;
    ring.rotation.x = Math.PI / 2;
    this._barrelPivot.add(ring);

    // Left handle
    const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6);
    const lHandle = new THREE.Mesh(handleGeo, darkMat);
    lHandle.rotation.z = Math.PI / 2;
    lHandle.position.set(-0.22, -0.14, 0.35);
    this._barrelPivot.add(lHandle);

    // Right handle
    const rHandle = lHandle.clone();
    rHandle.position.set(0.22, -0.14, 0.35);
    this._barrelPivot.add(rHandle);

    // Muzzle flash (hidden until fired)
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0,
    });
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 4),
      flashMat
    );
    this._muzzleFlash.position.z = 1.6;
    this._barrelPivot.add(this._muzzleFlash);
    this._flashTimer = 0;

    this._scene.add(this._group);
  }

  // ── 3-D crosshair (visible in VR) ────────────────────────────
  _buildVRCrosshair() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this._vrCrosshair = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.034, 20),
      mat
    );
    this._vrCrosshair.visible = false;
    this._scene.add(this._vrCrosshair);
  }

  // ── Per-frame update ──────────────────────────────────────────
  update(dt, vrMode, input) {
    // Muzzle flash fade
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      this._muzzleFlash.material.opacity =
        Math.max(0, this._flashTimer / 0.08);
    }

    if (vrMode) {
      // VR: barrel follows right controller
      const rc = input.getRightController();
      if (rc) {
        const dir = new THREE.Vector3(0, 0, -1)
          .applyQuaternion(rc.quaternion);
        const worldPos = new THREE.Vector3();
        rc.getWorldPosition(worldPos);
        const target = worldPos.clone().addScaledVector(dir, 10);
        this._barrelPivot.lookAt(target);
        this._barrelPivot.rotateX(Math.PI / 2);

        // 3-D crosshair at aim point
        this._vrCrosshair.visible = true;
        this._vrCrosshair.position.copy(worldPos).addScaledVector(dir, 18);
        this._vrCrosshair.lookAt(worldPos);
      }
    } else {
      // Desktop: barrel follows camera look
      this._vrCrosshair.visible = false;
      const dir    = new THREE.Vector3();
      const origin = new THREE.Vector3();
      this._camera.getWorldDirection(dir);
      this._camera.getWorldPosition(origin);
      const target = origin.clone().addScaledVector(dir, 12);
      this._barrelPivot.lookAt(target);
      this._barrelPivot.rotateX(Math.PI / 2);
    }
  }

  // ── Check if crosshair overlaps a drone ──────────────────────
  isAimingAtDrone(drones) {
    this._raycaster.setFromCamera(new THREE.Vector2(0, 0), this._camera);
    const meshes = [];
    for (const d of drones) d.group.traverse(o => { if (o.isMesh) meshes.push(o); });
    return this._raycaster.intersectObjects(meshes).length > 0;
  }

  // ── Fire ──────────────────────────────────────────────────────
  // Returns { killed: bool, drone, points, hitPoint }
  shoot(drones, particles, audio, vrMode) {
    audio.shoot();
    this._triggerFlash();

    // Haptic on VR right controller
    if (vrMode) {
      const session = this._renderer.xr.getSession();
      session?.inputSources.forEach(src => {
        if (src.handedness === 'right')
          src.gamepad?.hapticActuators?.[0]?.pulse(0.5, 50);
      });
    }

    const { origin, direction } = this._getAimRay(vrMode);
    particles.addTracer(
      origin.clone(),
      origin.clone().addScaledVector(direction, 120)
    );

    this._raycaster.set(origin, direction);
    const meshes  = [];
    const meshMap = new Map();
    for (const d of drones) {
      d.group.traverse(o => {
        if (o.isMesh) {
          meshes.push(o);
          meshMap.set(o.uuid, d);
        }
      });
    }

    const hits = this._raycaster.intersectObjects(meshes);
    if (!hits.length) return { killed: false };

    const drone  = meshMap.get(hits[0].object.uuid);
    if (!drone || drone.dead) return { killed: false };

    const killed = drone.hit(1);
    audio.hit();

    if (killed) {
      particles.emit(drone.group.position.clone(), 'fire', 14, 8);
      particles.emit(drone.group.position.clone(), 'spark', 6, 10);
      audio.explosion(drone.spec.size);
      drone.destroy();
      return { killed: true, drone, points: drone.spec.points };
    }

    particles.emit(hits[0].point.clone(), 'spark', 4, 4);
    return { killed: false };
  }

  // ── Helpers ───────────────────────────────────────────────────
  _triggerFlash() {
    this._muzzleFlash.material.opacity = 1;
    this._flashTimer = 0.08;
  }

  _getAimRay(vrMode) {
    if (vrMode) {
      // Will be set by input manager before this is called
      return this._vrRay || this._getCameraRay();
    }
    return this._getCameraRay();
  }

  _getCameraRay() {
    const origin    = new THREE.Vector3();
    const direction = new THREE.Vector3();
    this._camera.getWorldPosition(origin);
    this._camera.getWorldDirection(direction);
    return { origin, direction };
  }

  // Called by InputManager to update the VR aim ray each frame.
  setVRRay(origin, direction) {
    this._vrRay = { origin, direction };
  }
}
