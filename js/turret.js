import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const SPIN_MAX   = 12.0;
const SPIN_ACCEL = 22.0;
const SPIN_DECEL =  8.0;

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
    this._spinVel      = 0;

    this._build();
  }

  // ── Gun model ─────────────────────────────────────────────────
  _build() {
    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: 0x2e3a28 }),
      mid:    new THREE.MeshLambertMaterial({ color: 0x485840 }),
      light:  new THREE.MeshLambertMaterial({ color: 0x6a7a5a }),
      accent: new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      barrel: new THREE.MeshLambertMaterial({ color: 0x1e2820 }),
    };

    // Root group anchored to the camera rig
    this._group = new THREE.Group();
    this._group.position.set(0, 1.05, -0.55);
    this._cameraRig.add(this._group);

    // ── Static base (never rotates) ───────────────────────────
    // Cylindrical swivel post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.35, 8), mat.mid
    );
    post.position.set(0, -0.28, 0.05);
    this._group.add(post);

    // Swivel cup / collar at top of post
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.09, 0.07, 8), mat.dark
    );
    cup.position.set(0, -0.09, 0.05);
    this._group.add(cup);

    // ── Rotating upper assembly ───────────────────────────────
    // Everything in _barrelPivot rotates together when aiming:
    // housing, side handles, shroud, barrels.
    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    // Centre receiver box — ~40 % of original size (was 0.58×0.22×0.52)
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.10, 0.22), mat.dark
    );
    this._barrelPivot.add(housing);

    // Accent glow strip along the front-top edge
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.012, 0.015), mat.accent
    );
    strip.position.set(0, 0.056, -0.11);
    this._barrelPivot.add(strip);

    // Grab-state indicator ring (glows green when gripped)
    this._grabRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.010, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x004400, transparent: true, opacity: 0.7 })
    );
    this._grabRing.rotation.x = Math.PI / 2;
    this._barrelPivot.add(this._grabRing);

    // Side handles — one on each side of the housing
    this._addSideHandle(this._barrelPivot, mat, -1);
    this._addSideHandle(this._barrelPivot, mat,  1);

    // Cooling shroud around barrels
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.72, 10, 1, true), mat.mid
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

    // Muzzle flash sphere (hidden until fired)
    this._muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0 })
    );
    this._muzzleFlash.position.set(0, 0, -1.22);
    this._barrelPivot.add(this._muzzleFlash);

    // ── Barrel spin sub-group (rotates around its Z axis) ─────
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

    // ── VR world-space crosshair ──────────────────────────────
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

  // Side handle: horizontal arm + vertical grip post on each side of housing.
  _addSideHandle(parent, mat, side) {
    const xGrip = side * 0.22;

    // Short arm connecting housing wall to grip post
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.10, 6), mat.mid
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.165, 0, 0.04);
    parent.add(arm);

    // Vertical grip post (player holds this)
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), mat.mid
    );
    grip.position.set(xGrip, 0, 0.04);
    parent.add(grip);

    // Rounded caps at top and bottom of grip
    for (const yOff of [0.12, -0.12]) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 7, 5), mat.light
      );
      cap.position.set(xGrip, yOff, 0.04);
      parent.add(cap);
    }
  }

  // ── Per-frame update ──────────────────────────────────────────
  update(dt, vrMode, input, isFiring = false) {
    this._lastInput = input;

    if (this._fireCooldown > 0) this._fireCooldown -= dt;
    if (this._flashTimer   > 0) {
      this._flashTimer -= dt;
      this._muzzleFlash.material.opacity = Math.max(0, this._flashTimer / 0.06);
    }

    // Barrel spin — ramps up while firing, coasts down otherwise
    const shouldSpin = isFiring && this._grabbed;
    if (shouldSpin) {
      this._spinVel = Math.min(this._spinVel + SPIN_ACCEL * dt, SPIN_MAX);
    } else {
      this._spinVel = Math.max(this._spinVel - SPIN_DECEL * dt, 0);
    }
    this._barrelSpinGroup.rotation.z -= this._spinVel * dt;

    // Aim control
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
        this._vrCrosshair.visible = true;
        this._vrCrosshair.position.copy(groupPos).addScaledVector(aimDir, 21.3);
        this._vrCrosshair.lookAt(groupPos);
      } else {
        this._vrCrosshair.visible = false;
      }
    } else {
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

    this._fireCooldown = 0.10;

    audio.shoot();
    this._muzzleFlash.material.opacity = 1;
    this._flashTimer = 0.06;

    if (vrMode) {
      const session = this._renderer.xr.getSession();
      session?.inputSources.forEach(src => {
        const gripping = src.gamepad?.buttons[1]?.pressed;
        if (src.handedness === 'right' || (src.handedness === 'left' && gripping)) {
          src.gamepad?.hapticActuators?.[0]?.pulse(0.35, 30);
        }
      });
    }

    const groupPos = new THREE.Vector3();
    this._group.getWorldPosition(groupPos);
    const aimDir   = this._getWorldAimDir(vrMode, this._lastInput);
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
