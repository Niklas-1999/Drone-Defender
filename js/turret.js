import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class Turret {
  constructor(scene, camera, cameraRig, renderer) {
    this._scene     = scene;
    this._camera    = camera;
    this._cameraRig = cameraRig;
    this._renderer  = renderer;

    this._fireCooldown = 0;
    this._flashTimer   = 0;

    this._build();
  }

  // ── Gun model ─────────────────────────────────────────────────
  // Attached to cameraRig so it always sits in front of the player.
  _build() {
    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: 0x1a2230 }),
      mid:    new THREE.MeshLambertMaterial({ color: 0x2e4055 }),
      light:  new THREE.MeshLambertMaterial({ color: 0x4a6070 }),
      accent: new THREE.MeshBasicMaterial({ color: 0x00aaff }),
      barrel: new THREE.MeshLambertMaterial({ color: 0x2a3540 }),
    };

    // Root group – parented to cameraRig so it follows the player.
    // Positioned at chest height, 0.55 m in front of the rig origin.
    // Barrels point along LOCAL -Z (same direction as camera default look).
    this._group = new THREE.Group();
    this._group.position.set(0, 1.05, -0.55);
    this._cameraRig.add(this._group);

    // ── Static body (does not rotate with aim) ─────────────────
    this._body = new THREE.Group();
    this._group.add(this._body);

    // Main housing block
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.22, 0.52), mat.dark
    );
    this._body.add(housing);

    // Ammo box (right side)
    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.26, 0.22), mat.mid
    );
    ammoBox.position.set(0.38, -0.02, 0.08);
    this._body.add(ammoBox);

    // Ammo belt detail
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.18), mat.light
    );
    belt.position.set(0.29, 0.04, 0.08);
    this._body.add(belt);

    // Left grip handle
    this._addHandle(this._body, mat, -0.26);
    // Right grip handle
    this._addHandle(this._body, mat,  0.26);

    // Swivel post (vertical cylinder below housing)
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.35, 8), mat.mid
    );
    post.position.set(0, -0.28, 0.05);
    this._body.add(post);

    // Accent glow strip on housing
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.015, 0.02), mat.accent
    );
    strip.position.set(0, 0.115, -0.26);
    this._body.add(strip);

    // ── Barrel pivot (rotates to aim) ──────────────────────────
    // Its LOCAL -Z always points "forward" (same as camera) at rest.
    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    // Cooling shroud
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.72, 10, 1, true),
      mat.mid
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.60;
    this._barrelPivot.add(shroud);

    // Heat fins on shroud
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.012, 0.06), mat.light
      );
      fin.rotation.z = (i / 6) * Math.PI * 2;
      fin.position.z = -0.38 - i * 0.07;
      this._barrelPivot.add(fin);
    }

    // Two parallel barrels (left + right)
    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.042, 0.95, 7),
        mat.barrel
      );
      barrel.rotation.x = Math.PI / 2;      // points along -Z
      barrel.position.set(side * 0.075, 0, -0.73); // center of barrel
      this._barrelPivot.add(barrel);

      // Muzzle tip ring
      const tip = new THREE.Mesh(
        new THREE.TorusGeometry(0.038, 0.012, 5, 10),
        mat.light
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.set(side * 0.075, 0, -1.20);
      this._barrelPivot.add(tip);
    }

    // Muzzle flash (hidden until fired)
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0,
    });
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 4), flashMat
    );
    this._muzzleFlash.position.set(0, 0, -1.22);
    this._barrelPivot.add(this._muzzleFlash);

    // Invisible marker at muzzle tip for world-position queries
    this._muzzleMarker = new THREE.Object3D();
    this._muzzleMarker.position.set(0, 0, -1.22);
    this._barrelPivot.add(this._muzzleMarker);

    // ── VR 3-D crosshair ───────────────────────────────────────
    this._vrCrosshair = new THREE.Mesh(
      new THREE.RingGeometry(0.016, 0.030, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthTest: false,
      })
    );
    this._vrCrosshair.visible = false;
    this._scene.add(this._vrCrosshair);
  }

  _addHandle(parent, mat, xPos) {
    // Vertical grip post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.22, 6), mat.mid
    );
    post.position.set(xPos, -0.14, 0.12);
    parent.add(post);

    // Horizontal crossbar (T shape)
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), mat.light
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(xPos, -0.24, 0.12);
    parent.add(bar);
  }

  // ── Aim update ────────────────────────────────────────────────
  update(dt, vrMode, input) {
    // Cooldowns
    if (this._fireCooldown > 0) this._fireCooldown -= dt;
    if (this._flashTimer   > 0) {
      this._flashTimer -= dt;
      this._muzzleFlash.material.opacity = Math.max(0, this._flashTimer / 0.07);
    }

    const aimDir = this._getWorldAimDir(vrMode, input);
    this._aimBarrelAt(aimDir);

    if (vrMode) {
      // Show 3-D crosshair dot in the scene at aim distance
      const muzzlePos = new THREE.Vector3();
      this._muzzleMarker.getWorldPosition(muzzlePos);
      this._vrCrosshair.visible = true;
      this._vrCrosshair.position.copy(muzzlePos).addScaledVector(aimDir, 20);
      this._vrCrosshair.lookAt(muzzlePos);
    } else {
      this._vrCrosshair.visible = false;
    }
  }

  // Check if current aim ray overlaps any drone (for crosshair colour).
  isAimingAtDrone(drones) {
    const origin = new THREE.Vector3();
    const dir    = new THREE.Vector3();
    this._camera.getWorldPosition(origin);
    this._camera.getWorldDirection(dir);

    const rc = new THREE.Raycaster(origin, dir);
    const meshes = [];
    for (const d of drones) d.group.traverse(o => { if (o.isMesh) meshes.push(o); });
    return rc.intersectObjects(meshes).length > 0;
  }

  // ── Fire ──────────────────────────────────────────────────────
  // Returns { muzzlePos, aimDir } for the projectile manager to use,
  // or null if still on cooldown.
  fire(vrMode, audio) {
    if (this._fireCooldown > 0) return null;
    this._fireCooldown = 0.11; // ~9 rounds/s

    audio.shoot();
    this._muzzleFlash.material.opacity = 1;
    this._flashTimer = 0.07;

    // Haptic on VR right controller
    if (vrMode) {
      const session = this._renderer.xr.getSession();
      session?.inputSources.forEach(src => {
        if (src.handedness === 'right')
          src.gamepad?.hapticActuators?.[0]?.pulse(0.45, 40);
      });
    }

    const muzzlePos = new THREE.Vector3();
    this._muzzleMarker.getWorldPosition(muzzlePos);

    const aimDir = this._getWorldAimDir(vrMode, null);
    return { muzzlePos, aimDir };
  }

  // ── Helpers ───────────────────────────────────────────────────
  _getWorldAimDir(vrMode, input) {
    if (vrMode && input) {
      const rc = input.getRightController();
      if (rc) {
        const wq = new THREE.Quaternion();
        rc.getWorldQuaternion(wq);
        return new THREE.Vector3(0, 0, -1).applyQuaternion(wq);
      }
    }
    const dir = new THREE.Vector3();
    this._camera.getWorldDirection(dir);
    return dir;
  }

  _aimBarrelAt(worldAimDir) {
    // Rotate barrelPivot so its local -Z aligns with worldAimDir.
    const parentWQ = new THREE.Quaternion();
    this._barrelPivot.parent.getWorldQuaternion(parentWQ);
    // Convert world aim to parent-local space
    const localAim = worldAimDir.clone().applyQuaternion(parentWQ.conjugate());
    this._barrelPivot.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      localAim.normalize()
    );
  }
}
