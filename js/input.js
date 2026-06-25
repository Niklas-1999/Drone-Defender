import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class InputManager {
  constructor(renderer, cameraRig, camera, scene) {
    this._renderer   = renderer;
    this._cameraRig  = cameraRig;
    this._camera     = camera;
    this._scene      = scene;

    this.mouseLocked = false;
    this._yaw        = 0;
    this._pitch      = 0;

    // Full-auto fire state
    this._mouseHeld          = false;
    this._spaceHeld          = false;
    this._triggerHeld        = false;
    this._triggerJustPressed = false;   // VR rising-edge (consumed once)

    this._abilityPending = null;

    // VR grip state
    this._gripLeft  = false;
    this._gripRight = false;

    this._rightController = null;
    this._leftController  = null;
    this._triggerWas      = { left: false, right: false };
    this._buttonWas       = {};

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

    // Left-click: lock pointer (first click) or hold-to-fire
    document.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (!this.mouseLocked && window.game?.state !== 'menu' && window.game?.state !== 'gameover') {
        document.body.requestPointerLock();
      } else if (this.mouseLocked) {
        this._mouseHeld = true;
      }
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this._mouseHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = !!document.pointerLockElement;
      if (!this.mouseLocked) this._mouseHeld = false;
    });

    document.addEventListener('keydown', e => {
      const state = window.game?.state;

      // Start / restart from menu or gameover
      if ((e.key === ' ' || e.code === 'Space') &&
          (state === 'menu' || state === 'gameover')) {
        e.preventDefault();
        if (!this.mouseLocked) document.body.requestPointerLock();
        window.game?.start();
        return;
      }

      if (state !== 'playing') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this._spaceHeld = true;
      }
      if (e.key === '1') this._abilityPending = 'scan';
      if (e.key === '2') this._abilityPending = 'emp';
      if (e.key === '3') this._abilityPending = 'turret';
    });

    document.addEventListener('keyup', e => {
      if (e.key === ' ' || e.code === 'Space') this._spaceHeld = false;
    });
  }

  // ── VR controllers ────────────────────────────────────────────
  _setupVRControllers() {
    for (let i = 0; i < 2; i++) {
      const ctrl = this._renderer.xr.getController(i);
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
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    ctrl.add(new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.45 })
    ));
    ctrl.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.09, 0.11),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    ));
  }

  // ── Per-frame update ──────────────────────────────────────────
  update(dt, frame, vrMode) {
    if (!vrMode) {
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

    this._gripLeft  = false;
    this._gripRight = false;
    this._triggerJustPressed = false;

    for (const src of session.inputSources) {
      const gp   = src.gamepad;
      const hand = src.handedness;
      if (!gp) continue;

      if (hand === 'right') {
        const trig = (gp.buttons[0]?.value ?? 0) > 0.5;
        this._triggerHeld = trig;
        if (trig && !this._triggerWas.right) this._triggerJustPressed = true;
        this._triggerWas.right = trig;

        if (gp.buttons[1]?.pressed) this._gripRight = true;
      }

      if (hand === 'left') {
        const map = [
          { idx: 4, key: 'scan' },
          { idx: 5, key: 'emp'  },
        ];
        for (const { idx, key } of map) {
          const pressed = gp.buttons[idx]?.pressed;
          const bKey    = `${hand}_${idx}`;
          if (pressed && !this._buttonWas[bKey]) this._abilityPending = key;
          this._buttonWas[bKey] = pressed;
        }
        if (gp.buttons[1]?.pressed) this._gripLeft = true;
      }
    }
  }

  // ── Fire state accessors ──────────────────────────────────────
  // Full-auto: true while trigger / mouse / space is held.
  isTriggerHeld() {
    return this._mouseHeld || this._spaceHeld || this._triggerHeld;
  }

  // Rising-edge of VR right trigger (for console button presses).
  consumeTriggerJustPressed() {
    const v = this._triggerJustPressed;
    this._triggerJustPressed = false;
    return v;
  }

  consumeAbility() {
    const v = this._abilityPending;
    this._abilityPending = null;
    return v;
  }

  // Legacy single-shot (still used by desktop click path above)
  consumeShot() { return false; }

  // ── Grip / grab state ─────────────────────────────────────────
  isGrabbing()       { return this._gripLeft || this._gripRight; }
  areBothGripping()  { return this._gripLeft && this._gripRight; }
  isGrippingLeft()   { return this._gripLeft;  }
  isGrippingRight()  { return this._gripRight; }

  peekShot() { return false; } // kept for compat, no longer used

  // ── VR controller references ──────────────────────────────────
  getRightController() { return this._rightController; }
  getLeftController()  { return this._leftController;  }
}
