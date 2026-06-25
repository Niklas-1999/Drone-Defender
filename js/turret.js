import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const SPIN_MAX   = 12.0;  // rad/s max barrel rotation
const SPIN_ACCEL = 22.0;  // rad/s² when firing
const SPIN_DECEL =  8.0;  // rad/s² when idle

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
    this._spinVel      = 0;   // current barrel spin speed (rad/s)

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

    this._body.add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.52), mat.dark));

    const ammoBox = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.26, 0.22), mat.mid);
    ammoBox.position.set(0.38, -0.02, 0.08);
    this._body.add(ammoBox);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.18), mat.light);
    belt.position.set(0.29, 0.04, 0.08);
    this._body.add(belt);

    this._addHandle(this._body, mat, -0.26);
    this._addHandle(this._body, mat,  0.26);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.35, 8), mat.mid);
    post.position.set(0, -0.28, 0.05);
    this._body.add(post);

    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.015, 0.02), mat.accent);
    strip.position.set(0, 0.115, -0.26);
    this._body.add(strip);

    // Grab-state indicator ring
    this._grabRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.012, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0x004400, transparent: true, opacity: 0.6 })
    );
    this._grabRing.rotation.x = Math.PI / 2;
    this._grabRing.position.set(0, 0, 0.05);
    this._body.add(this._grabRing);

    // ── Barrel pivot (aims) ──────────────────────────────────────
    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    // Cooling shroud (does NOT spin)
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.72, 10, 1, true), mat.mid
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.60;
    this._barrelPivot.add(shroud);

    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.012, 0.06), mat.light);
      fin.rotation.z = (i / 6) * Math.PI * 2;
      fin.position.z = -0.38 - i * 0.07;
      this._barrelPivot.add(fin);
    }

    // Muzzle flash (does NOT spin)
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0 })
    );
    this._muzzleFlash.position.set(0, 0, -1.22);
    this._barrelPivot.add(this._muzzleFlash);

    // ── Barrel spin group (rotates around Z while firing) ────────
    this._barrelSpinGroup = new THREE.Group();
    this._barrelPivot.add(this._barrelSpinGroup);

    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.042, 0.95, 7), mat.barrel
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.075, 0, -0.73);
      this._barrelSpinGroup.add(barrel);

      const tip = new THREE.Mesh(
        new THREE.TorusGeometry(0.038, 0.012, 5, 10), mat.light
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.set(side * 0.075, 0, -1.20);
      this._barrelSpinGroup.add(tip);
    }

    // ── VR crosshair ─────────────────────────────────────────────
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
  // isFiring: whether the player is holding the trigger this frame.
  update(dt, vrMode, input, isFiring = false) {
    this._lastInput = input;

    // Cooldown timers
    if (this._fireCooldown > 0) this._fireCooldown -= dt;
    if (this._flashTimer   > 0) {
      this._flashTimer -= dt;
      this._muzzleFlash.material.opacity = Math.max(0, this._flashTimer / 0.07);
    }

    // ── Barrel spin ──────────────────────────────────────────────
    const shouldSpin = isFiring && this._grabbed;
    if (shouldSpin) {
      this._spinVel = Math.min(this._spinVel + SPIN_ACCEL * dt, SPIN_MAX);
    } else {
      this._spinVel = Math.max(this._spinVel - SPIN_DECEL * dt, 0);
    }
    this._barrelSpinGroup.rotation.z -= this._spinVel * dt;

    // ── Aim control ──────────────────────────────────────────────
    if (vrMode) {
      this._grabbed = input ? input.isGrabbing() : false;
      if (this._grabbed) {
        this._aimBarrelAt(this._getWorldAimDir(vrMode, input));
      }
      this._grabRing.material.color.setHex(this._grabbed ? 0x00ff44 : 0x004400);

      if (this._grabbed) {
        const groupPos = new THREE.Vector3();
        this._group.getWorldPosition(groupPos);
        const aimDir = this._getWorldAimDir(vrMode, input);
        const xhPos  = groupPos.clone().addScaledVector(aimDir, 1.3 + 20);
        this._vrCrosshair.visible = true;
        this._vrCrosshair.position.copy(xhPos);
        this._vrCrosshair.lookAt(groupPos);
      } else {
        this._vrCrosshair.visible = false;
      }
    } else {
      // Desktop: always tracks mouse
      this._grabbed = true;
      this._grabRing.material.color.setHex(0x004400);
      this._aimBarrelAt(this._getWorldAimDir(false, input));
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
  fire(vrMode, audio) {
    if (this._fireCooldown > 0) return null;
    if (vrMode && !this._grabbed) return null;

    this._fireCooldown = 0.10; // ~10 rounds/s full-auto

    audio.shoot();
    this._muzzleFlash.material.opacity = 1;
    this._flashTimer = 0.06;

    if (vrMode) {
      const session = this._renderer.xr.getSession();
      session?.inputSources.forEach(src => {
        if (src.handedness === 'right')
          src.gamepad?.hapticActuators?.[0]?.pulse(0.35, 30);
      });
    }

    // Muzzle world position = gun group centre + 1.3 m along aim direction
    const groupPos = new THREE.Vector3();
    this._group.getWorldPosition(groupPos);
    const aimDir  = this._getWorldAimDir(vrMode, this._lastInput);
    const muzzlePos = groupPos.clone().addScaledVector(aimDir, 1.3);

    return { muzzlePos, aimDir };
  }

  // ── Helpers ───────────────────────────────────────────────────
  _getWorldAimDir(vrMode, input) {
    if (vrMode && input) {
      const rc = input.getRightController();
      if (rc) {
        return new THREE.Vector3(0, 0, -1)
          .applyQuaternion(rc.getWorldQuaternion(new THREE.Quaternion()));
      }
      const lc = input.getLeftController();
      if (lc) {
        return new THREE.Vector3(0, 0, -1)
          .applyQuaternion(lc.getWorldQuaternion(new THREE.Quaternion()));
      }
    }
    return this._camera.getWorldDirection(new THREE.Vector3());
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
