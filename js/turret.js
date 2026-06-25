import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class Turret {
  constructor(scene, camera, cameraRig, renderer) {
    this._scene     = scene;
    this._camera    = camera;
    this._cameraRig = cameraRig;
    this._renderer  = renderer;

    this._fireCooldown = 0;
    this._flashTimer   = 0;
    this._lastInput    = null;
    this._grabbed      = false;

    this._build();
  }

  // ── Gun model ─────────────────────────────────────────────────
  _build() {
    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: 0x1a2230 }),
      mid:    new THREE.MeshLambertMaterial({ color: 0x2e4055 }),
      light:  new THREE.MeshLambertMaterial({ color: 0x4a6070 }),
      accent: new THREE.MeshBasicMaterial({ color: 0x00aaff }),
      barrel: new THREE.MeshLambertMaterial({ color: 0x2a3540 }),
    };

    this._group = new THREE.Group();
    this._group.position.set(0, 1.05, -0.55);
    this._cameraRig.add(this._group);

    // ── Static body ─────────────────────────────────────────────
    this._body = new THREE.Group();
    this._group.add(this._body);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.22, 0.52), mat.dark
    );
    this._body.add(housing);

    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.26, 0.22), mat.mid
    );
    ammoBox.position.set(0.38, -0.02, 0.08);
    this._body.add(ammoBox);

    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.18), mat.light
    );
    belt.position.set(0.29, 0.04, 0.08);
    this._body.add(belt);

    this._addHandle(this._body, mat, -0.26);
    this._addHandle(this._body, mat,  0.26);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.35, 8), mat.mid
    );
    post.position.set(0, -0.28, 0.05);
    this._body.add(post);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.015, 0.02), mat.accent
    );
    strip.position.set(0, 0.115, -0.26);
    this._body.add(strip);

    // Grab-state indicator ring (glows green when grabbed)
    this._grabRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.012, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0x004400, transparent: true, opacity: 0.6 })
    );
    this._grabRing.rotation.x = Math.PI / 2;
    this._grabRing.position.set(0, 0, 0.05);
    this._body.add(this._grabRing);

    // ── Barrel pivot ────────────────────────────────────────────
    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.72, 10, 1, true), mat.mid
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.60;
    this._barrelPivot.add(shroud);

    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.012, 0.06), mat.light
      );
      fin.rotation.z = (i / 6) * Math.PI * 2;
      fin.position.z = -0.38 - i * 0.07;
      this._barrelPivot.add(fin);
    }

    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.042, 0.95, 7), mat.barrel
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.075, 0, -0.73);
      this._barrelPivot.add(barrel);

      const tip = new THREE.Mesh(
        new THREE.TorusGeometry(0.038, 0.012, 5, 10), mat.light
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.set(side * 0.075, 0, -1.20);
      this._barrelPivot.add(tip);
    }

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0,
    });
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 4), flashMat
    );
    this._muzzleFlash.position.set(0, 0, -1.22);
    this._barrelPivot.add(this._muzzleFlash);

    // ── VR 3-D crosshair ────────────────────────────────────────
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
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.22, 6), mat.mid
    );
    post.position.set(xPos, -0.14, 0.12);
    parent.add(post);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), mat.light
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(xPos, -0.24, 0.12);
    parent.add(bar);
  }

  // ── Update ────────────────────────────────────────────────────
  update(dt, vrMode, input) {
    this._lastInput = input;

    if (this._fireCooldown > 0) this._fireCooldown -= dt;
    if (this._flashTimer   > 0) {
      this._flashTimer -= dt;
      this._muzzleFlash.material.opacity = Math.max(0, this._flashTimer / 0.07);
    }

    if (vrMode) {
      // VR: only rotate barrel when player is gripping either controller
      this._grabbed = input ? input.isGrabbing() : false;
      if (this._grabbed) {
        const aimDir = this._getWorldAimDir(vrMode, input);
        this._aimBarrelAt(aimDir);
      }
      // Visual cue: grab ring colour
      this._grabRing.material.color.setHex(this._grabbed ? 0x00ff44 : 0x004400);

      // Show VR crosshair dot in world
      if (this._grabbed) {
        const groupPos = new THREE.Vector3();
        this._group.getWorldPosition(groupPos);
        const aimDir = this._getWorldAimDir(vrMode, input);
        const muzzlePos = groupPos.clone().addScaledVector(aimDir, 1.3);
        this._vrCrosshair.visible = true;
        this._vrCrosshair.position.copy(muzzlePos).addScaledVector(aimDir, 20);
        this._vrCrosshair.lookAt(muzzlePos);
      } else {
        this._vrCrosshair.visible = false;
      }
    } else {
      // Desktop: barrel always follows mouse look
      this._grabbed = true;
      this._grabRing.material.color.setHex(0x004400);
      const aimDir = this._getWorldAimDir(false, input);
      this._aimBarrelAt(aimDir);
      this._vrCrosshair.visible = false;
    }
  }

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
  // Returns { muzzlePos, aimDir } or null if on cooldown / not grabbed.
  fire(vrMode, audio) {
    if (this._fireCooldown > 0) return null;
    if (vrMode && !this._grabbed) return null;

    this._fireCooldown = 0.11;

    audio.shoot();
    this._muzzleFlash.material.opacity = 1;
    this._flashTimer = 0.07;

    if (vrMode) {
      const session = this._renderer.xr.getSession();
      session?.inputSources.forEach(src => {
        if (src.handedness === 'right')
          src.gamepad?.hapticActuators?.[0]?.pulse(0.45, 40);
      });
    }

    // Compute muzzle position from group world pos + aim direction
    // This avoids any world-matrix update timing issues with the marker object.
    const groupWorldPos = new THREE.Vector3();
    this._group.getWorldPosition(groupWorldPos);
    const aimDir = this._getWorldAimDir(vrMode, this._lastInput);
    const muzzlePos = groupWorldPos.clone().addScaledVector(aimDir, 1.3);

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
      // Fall back to left controller if right not connected
      const lc = input.getLeftController();
      if (lc) {
        const wq = new THREE.Quaternion();
        lc.getWorldQuaternion(wq);
        return new THREE.Vector3(0, 0, -1).applyQuaternion(wq);
      }
    }
    const dir = new THREE.Vector3();
    this._camera.getWorldDirection(dir);
    return dir;
  }

  _aimBarrelAt(worldAimDir) {
    const parentWQ = new THREE.Quaternion();
    this._barrelPivot.parent.getWorldQuaternion(parentWQ);
    const localAim = worldAimDir.clone().applyQuaternion(parentWQ.conjugate());
    this._barrelPivot.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      localAim.normalize()
    );
  }
}
