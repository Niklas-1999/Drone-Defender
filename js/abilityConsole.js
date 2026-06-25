import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

const BTNS = [
  { key: 'scan',   label: 'SCAN',   color: 0x00ccff },
  { key: 'emp',    label: 'EMP',    color: 0xffaa00 },
  { key: 'turret', label: 'TURRET', color: 0x00ff88 },
];

// 3-D ability console parented to the camera rig, to the player's right.
// In VR: hover with either controller ray + pull trigger → activates ability.
// On desktop: click keyboard 1/2/3 (handled by InputManager).
export class AbilityConsole {
  constructor(cameraRig) {
    this._group    = new THREE.Group();
    // Right side, arm height, angled 30° inward toward player
    this._group.position.set(0.95, 0.80, -0.15);
    this._group.rotation.y = -Math.PI / 6;
    cameraRig.add(this._group);

    this._buttons  = [];
    this._hovered  = null;
    this._raycaster = new THREE.Raycaster();
    this._pressCooldown = 0;

    this._buildPanel();
    this._buildButtons();
  }

  // ── Build 3-D panel ───────────────────────────────────────────
  _buildPanel() {
    // Backing plate
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.82, 0.055),
      new THREE.MeshLambertMaterial({ color: 0x1a2840 })
    );
    this._group.add(panel);

    // "ABILITIES" header canvas
    const hCanvas = document.createElement('canvas');
    hCanvas.width  = 256;
    hCanvas.height = 64;
    const hCtx = hCanvas.getContext('2d');
    hCtx.fillStyle = '#001020';
    hCtx.fillRect(0, 0, 256, 64);
    hCtx.fillStyle = '#00aaff';
    hCtx.font = 'bold 26px monospace';
    hCtx.textAlign = 'center';
    hCtx.fillText('ABILITIES', 128, 42);

    const header = new THREE.Mesh(
      new THREE.PlaneGeometry(0.30, 0.075),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(hCanvas),
        transparent: true,
      })
    );
    header.position.set(0, 0.35, 0.031);
    this._group.add(header);

    // Slim edge trim
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x0066aa });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.84, 0.005), trimMat);
    trim.position.z = -0.03;
    this._group.add(trim);
  }

  _buildButtons() {
    BTNS.forEach(({ key, label, color }, i) => {
      const y = 0.20 - i * 0.26;
      const btn = this._makeButton(key, label, color, y);
      this._buttons.push(btn);
    });
  }

  _makeButton(key, label, baseColor, y) {
    const btnGroup = new THREE.Group();
    btnGroup.position.set(0, y, 0.032);
    this._group.add(btnGroup);

    // Glowing face mesh (what the raycaster hits)
    const faceMat = new THREE.MeshLambertMaterial({
      color:   baseColor,
      emissive: new THREE.Color(baseColor).multiplyScalar(0.25),
    });
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.19, 0.035), faceMat
    );
    btnGroup.add(face);

    // Canvas label (name + cooldown/READY)
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);

    const label2D = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.16),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
    );
    label2D.position.z = 0.019;
    btnGroup.add(label2D);

    return { key, baseColor, label, btnGroup, face, faceMat, canvas, ctx, tex, label2D };
  }

  // ── Per-frame update ──────────────────────────────────────────
  // Returns the key of an activated ability, or null.
  update(abilities, leftCtrl, rightCtrl, triggerJustPressed) {
    this._hovered = null;
    if (this._pressCooldown > 0) this._pressCooldown -= 1 / 60;

    // Raycast from both controllers (right takes priority)
    for (const ctrl of [rightCtrl, leftCtrl]) {
      if (!ctrl) continue;
      const origin    = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, -1);
      ctrl.getWorldPosition(origin);
      direction.applyQuaternion(ctrl.getWorldQuaternion(new THREE.Quaternion()));
      this._raycaster.set(origin, direction);

      const faces = this._buttons.map(b => b.face);
      const hits  = this._raycaster.intersectObjects(faces);
      if (hits.length > 0) {
        this._hovered = this._buttons.find(b => b.face === hits[0].object) ?? null;
        if (this._hovered) break;
      }
    }

    // Update button visuals and draw labels
    let activated = null;
    for (const btn of this._buttons) {
      const ab       = abilities[btn.key];
      const ready    = ab.timer <= 0;
      const hovered  = btn === this._hovered;
      const col      = new THREE.Color(btn.baseColor);

      if (!ready) {
        btn.faceMat.color.set(0x444444);
        btn.faceMat.emissive.setScalar(0);
      } else if (hovered) {
        btn.faceMat.color.copy(col.clone().multiplyScalar(1.4));
        btn.faceMat.emissive.copy(col.clone().multiplyScalar(0.5));
      } else {
        btn.faceMat.color.copy(col);
        btn.faceMat.emissive.copy(col.clone().multiplyScalar(0.18));
      }

      // Press-in animation
      btn.face.position.z = (hovered && this._pressCooldown > 0.15) ? -0.010 : 0;

      // Draw label
      this._drawLabel(btn, ab);

      // Check press
      if (hovered && ready && triggerJustPressed && this._pressCooldown <= 0) {
        activated = btn.key;
        this._pressCooldown = 0.5;
      }
    }

    return activated;
  }

  _drawLabel(btn, ab) {
    const { ctx, canvas, label, tex } = btn;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    const ready = ab.timer <= 0;
    ctx.fillStyle = ready ? '#ffffff' : '#777777';
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, 52);

    ctx.font = '22px monospace';
    ctx.fillStyle = ready ? '#00ff88' : '#ffaa00';
    ctx.fillText(ready ? 'READY' : `${Math.ceil(ab.timer)}s`, W / 2, 90);

    tex.needsUpdate = true;
  }

  // Whether any button is currently hovered (for priority over shoot)
  isHovered() { return this._hovered !== null; }
}
