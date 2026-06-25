import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Handles desktop (mouse + keyboard) and VR (XR controller) input.
export class InputManager {
  constructor(renderer, cameraRig, camera, scene) {
    this._renderer   = renderer;
    this._cameraRig  = cameraRig;
    this._camera     = camera;
    this._scene      = scene;

    // Desktop state
    this.mouseLocked = false;
    this._yaw        = 0;
    this._pitch      = 0;
    this._shotPending     = false;
    this._abilityPending  = null;

    // VR state
    this._rightController = null;
    this._leftController  = null;
    this._triggerWas  = { left: false, right: false };
    this._buttonWas   = {};

    this._setupDesktop();
    this._setupVRControllers();
  }

  // ── Desktop ───────────────────────────────────────────────────
  _setupDesktop() {
    document.addEventListener('mousemove', e => {
      if (!this.mouseLocked) return;
      this._yaw   -= e.movementX * 0.002;
      this._pitch -= e.movementY * 0.002;
      this._pitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this._pitch));
    });

    // Click: first click locks pointer, subsequent clicks shoot
    document.addEventListener('click', () => {
      if (!this.mouseLocked && window.game?.state === 'playing') {
        document.body.requestPointerLock();
      } else if (this.mouseLocked) {
        this._shotPending = true;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = !!document.pointerLockElement;
    });

    document.addEventListener('keydown', e => {
      if (window.game?.state !== 'playing') return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this._shotPending = true;
      }
      if (e.key === '1') this._abilityPending = 'scan';
      if (e.key === '2') this._abilityPending = 'emp';
      if (e.key === '3') this._abilityPending = 'turret';
    });
  }

  // ── VR controllers ────────────────────────────────────────────
  _setupVRControllers() {
    for (let i = 0; i < 2; i++) {
      const ctrl = this._renderer.xr.getController(i);
      // Must be added to scene so WebXR can update its pose each frame.
      this._scene.add(ctrl);

      ctrl.addEventListener('connected', event => {
        const hand = event.data.handedness;
        if (hand === 'right') this._rightController = ctrl;
        if (hand === 'left')  this._leftController  = ctrl;
        this._addControllerVisual(ctrl);
      });
      ctrl.addEventListener('disconnected', () => {
        if (ctrl === this._rightController) this._rightController = null;
        if (ctrl === this._leftController)  this._leftController  = null;
      });
    }
  }

  _addControllerVisual(ctrl) {
    // Pointer ray line
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.45 })
    );
    ctrl.add(line);

    // Simple box grip
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.09, 0.11),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    );
    ctrl.add(grip);
  }

  // ── Per-frame update ──────────────────────────────────────────
  update(dt, frame, vrMode) {
    if (!vrMode) {
      // Apply mouse look to camera rig / camera
      this._cameraRig.rotation.y = this._yaw;
      this._camera.rotation.order = 'YXZ';
      this._camera.rotation.x = this._pitch;
    } else {
      this._pollVRButtons();
    }
  }

  _pollVRButtons() {
    const session = this._renderer.xr.getSession();
    if (!session) return;

    for (const src of session.inputSources) {
      const gp   = src.gamepad;
      const hand = src.handedness;
      if (!gp) continue;

      if (hand === 'right') {
        const trig = gp.buttons[0]?.value > 0.5;
        if (trig && !this._triggerWas.right) this._shotPending = true;
        this._triggerWas.right = trig;
      }

      if (hand === 'left') {
        // X (idx 4) → scan, Y (idx 5) → emp, grip/squeeze (idx 1) → turret
        const map = [
          { idx: 4, key: 'scan'   },
          { idx: 5, key: 'emp'    },
          { idx: 1, key: 'turret' },
        ];
        for (const { idx, key } of map) {
          const pressed = gp.buttons[idx]?.pressed;
          const bKey    = `${hand}_${idx}`;
          if (pressed && !this._buttonWas[bKey]) this._abilityPending = key;
          this._buttonWas[bKey] = pressed;
        }
      }
    }
  }

  // ── Consumed-once accessors (call once per frame) ─────────────
  consumeShot() {
    const v = this._shotPending;
    this._shotPending = false;
    return v;
  }

  consumeAbility() {
    const v = this._abilityPending;
    this._abilityPending = null;
    return v;
  }

  // ── VR controller reference ───────────────────────────────────
  getRightController() { return this._rightController; }
  getLeftController()  { return this._leftController;  }
}
