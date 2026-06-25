import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class UIManager {
  constructor(camera) {
    this._camera = camera;
    this._vrMode = false;

    // DOM refs
    this._elScore    = document.getElementById('hud-score');
    this._elWave     = document.getElementById('hud-wave');
    this._elDrones   = document.getElementById('hud-drones');
    this._elMoney    = document.getElementById('hud-money');
    this._elHpFill   = document.getElementById('base-hp-fill');
    this._elAnnounce = document.getElementById('wave-announce');
    this._elOverlay  = document.getElementById('overlay');
    this._elEmpHint  = document.getElementById('hud-emp-hint');
    this._crosshair  = document.getElementById('crosshair');

    this._announceTimeout = null;

    this._buildAmmoRing();
    this._buildEmpRing();
    this._buildVRHUD(camera);
  }

  // ── Ammo ring (bottom-right) ──────────────────────────────────
  _buildAmmoRing() {
    const c = document.createElement('canvas');
    c.width = c.height = 100;
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;pointer-events:none;z-index:100;';
    document.body.appendChild(c);
    this._ammoCanvas = c;
    this._ammoCtx    = c.getContext('2d');

    // Fire-rate label below ammo ring
    const lbl = document.createElement('div');
    lbl.style.cssText = [
      'position:fixed', 'bottom:5px', 'right:20px',
      'width:100px', 'text-align:center',
      'font-family:monospace', 'font-size:9px', 'letter-spacing:2px',
      'color:#336688', 'pointer-events:none', 'z-index:100',
    ].join(';');
    document.body.appendChild(lbl);
    this._rofLabel = lbl;

    this._drawAmmoArc(this._ammoCtx, 50, 50, 36, 50, 50, 7);
  }

  // ── EMP ring (bottom-left) ────────────────────────────────────
  _buildEmpRing() {
    const c = document.createElement('canvas');
    c.width = c.height = 100;
    c.style.cssText = 'position:fixed;bottom:20px;left:20px;pointer-events:none;z-index:100;';
    document.body.appendChild(c);
    this._empCanvas = c;
    this._empCtx    = c.getContext('2d');
    this._drawEmpArc(this._empCtx, 50, 50, 36, 0, false, 7); // start locked
  }

  // ── VR HUD ────────────────────────────────────────────────────
  _buildVRHUD(camera) {
    const canvas  = document.createElement('canvas');
    canvas.width  = 640;
    canvas.height = 200;
    this._vrCanvas  = canvas;
    this._vrCtx     = canvas.getContext('2d');
    this._vrTexture = new THREE.CanvasTexture(canvas);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.225),
      new THREE.MeshBasicMaterial({
        map: this._vrTexture, transparent: true, depthTest: false,
      })
    );
    mesh.position.set(0, -0.28, -0.75);
    this._vrHUDMesh = mesh;

    this._vrHUDGroup = new THREE.Group();
    this._vrHUDGroup.add(mesh);
    this._vrHUDGroup.visible = false;
    camera.add(this._vrHUDGroup);
  }

  // ── Arc drawing helpers ───────────────────────────────────────

  _drawAmmoArc(ctx, cx, cy, r, ammo, maxAmmo, lineW) {
    const frac = maxAmmo > 0 ? ammo / maxAmmo : 0;
    ctx.save();

    // Dark track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,20,40,0.85)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (ammo > 0) {
      const hue = Math.round(frac * 120);
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
      ctx.strokeStyle = `hsl(${hue},90%,55%)`;
      ctx.lineWidth   = lineW;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    // Label + value
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a6a8a';
    ctx.font = `7px monospace`;
    ctx.fillText('AMMO', cx, cy - r * 0.55);
    ctx.fillStyle = ammo === 0 ? '#ff4455' : '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.44)}px monospace`;
    ctx.fillText(`${ammo}`, cx, cy - r * 0.10);
    ctx.fillStyle = '#556677';
    ctx.font = `${Math.round(r * 0.28)}px monospace`;
    ctx.fillText(`/${maxAmmo}`, cx, cy + r * 0.36);

    ctx.restore();
  }

  _drawEmpArc(ctx, cx, cy, r, readyFraction, unlocked, lineW) {
    ctx.save();

    // Dark track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,20,40,0.85)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (unlocked && readyFraction > 0) {
      const col = readyFraction >= 1 ? '#ff44ff' : '#883399';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + readyFraction * Math.PI * 2, false);
      ctx.strokeStyle = col;
      ctx.lineWidth   = lineW;
      ctx.lineCap     = 'round';
      if (readyFraction >= 1) ctx.shadowBlur = 8, ctx.shadowColor = '#ff00ff';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Label
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a6a8a';
    ctx.font = `7px monospace`;
    ctx.fillText('EMP', cx, cy - r * 0.55);

    if (!unlocked) {
      ctx.fillStyle = '#334455';
      ctx.font = `${Math.round(r * 0.30)}px monospace`;
      ctx.fillText('LOCKED', cx, cy + r * 0.10);
    } else if (readyFraction >= 1) {
      ctx.fillStyle = '#ff88ff';
      ctx.font = `bold ${Math.round(r * 0.32)}px monospace`;
      ctx.fillText('READY', cx, cy + r * 0.10);
    } else {
      // Remaining seconds
      ctx.fillStyle = '#aa66cc';
      ctx.font = `bold ${Math.round(r * 0.38)}px monospace`;
      ctx.fillText(`${Math.ceil((1 - readyFraction) * 15)}s`, cx, cy + r * 0.10);
    }

    ctx.restore();
  }

  // ── VR HUD draw ────────────────────────────────────────────────
  _drawVRHUD({ score, wave, drones, baseHP, ammo, maxAmmo, money, empFraction, empUnlocked, fireRate }) {
    const ctx = this._vrCtx;
    const W = 640, H = 200;
    ctx.clearRect(0, 0, W, H);

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0,8,20,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,170,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // ── Top row: SCORE / WAVE / DRONES / MONEY ──
    const labels = [
      { text: 'SCORE',  val: `${score}`,    x: 36 },
      { text: 'WAVE',   val: `${wave}`,     x: 196 },
      { text: 'DRONES', val: `${drones}`,   x: 356 },
      { text: '$',      val: `${money}`,    x: 516, gold: true },
    ];
    for (const l of labels) {
      ctx.fillStyle = '#2a5a7a';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(l.text, l.x, 18);
      ctx.fillStyle = l.gold ? '#ffd700' : '#00ccff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(l.val, l.x, 40);
    }

    // ── HP bar ──
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(14, 52, W - 28, 10);
    ctx.fillStyle = baseHP > 30 ? '#ff8800' : '#ff2200';
    ctx.fillRect(14, 52, (W - 28) * (baseHP / 100), 10);
    ctx.fillStyle = '#2a4a5a';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', 14, 74);
    ctx.fillText(`ROF: ${fireRate}/s`, 200, 74);

    // ── Ammo ring (right side) ──
    this._drawAmmoArc(ctx, 568, 130, 50, ammo, maxAmmo, 8);

    // ── EMP ring (left side) ──
    this._drawEmpArc(ctx, 68, 130, 45, empFraction, empUnlocked, 7);

    this._vrTexture.needsUpdate = true;
  }

  // ── Public API ────────────────────────────────────────────────

  enterVR() {
    this._vrMode = true;
    this._vrHUDGroup.visible = true;
    this._ammoCanvas.style.display = 'none';
    this._empCanvas.style.display  = 'none';
    this._rofLabel.style.display   = 'none';
    document.getElementById('hud-topleft').style.display     = 'none';
    document.getElementById('hud-topcenter').style.display   = 'none';
    document.getElementById('hud-topright').style.display    = 'none';
    document.getElementById('hud-bottomcenter').style.display= 'none';
    document.getElementById('crosshair').style.display       = 'none';
  }

  exitVR() {
    this._vrMode = false;
    this._vrHUDGroup.visible = false;
    this._ammoCanvas.style.display = '';
    this._empCanvas.style.display  = '';
    this._rofLabel.style.display   = '';
    document.getElementById('hud-topleft').style.display     = '';
    document.getElementById('hud-topcenter').style.display   = '';
    document.getElementById('hud-topright').style.display    = '';
    document.getElementById('hud-bottomcenter').style.display= '';
    document.getElementById('crosshair').style.display       = '';
  }

  update({ score, wave, drones, baseHP, ammo = 50, maxAmmo = 50,
           money = 0, empFraction = 0, empUnlocked = false, fireRate = 5 }) {

    if (this._vrMode) {
      this._drawVRHUD({ score, wave, drones, baseHP, ammo, maxAmmo,
                        money, empFraction, empUnlocked, fireRate });
      return;
    }

    // DOM updates
    this._elScore.textContent   = score;
    this._elWave.textContent    = wave || '–';
    this._elDrones.textContent  = drones;
    this._elMoney.textContent   = `$${money}`;
    this._elHpFill.style.width  = baseHP + '%';

    // EMP hint
    if (empUnlocked) {
      this._elEmpHint.classList.remove('hidden');
      if (empFraction >= 1) {
        this._elEmpHint.textContent = '[E] EMP READY';
        this._elEmpHint.classList.remove('cooldown');
      } else {
        this._elEmpHint.textContent = `EMP ${Math.ceil((1 - empFraction) * 15)}s`;
        this._elEmpHint.classList.add('cooldown');
      }
    } else {
      this._elEmpHint.classList.add('hidden');
    }

    // Ammo ring
    const actx = this._ammoCtx;
    actx.clearRect(0, 0, 100, 100);
    this._drawAmmoArc(actx, 50, 50, 36, ammo, maxAmmo, 7);
    this._rofLabel.textContent = `ROF ${fireRate}/s`;

    // EMP ring
    const ectx = this._empCtx;
    ectx.clearRect(0, 0, 100, 100);
    this._drawEmpArc(ectx, 50, 50, 36, empFraction, empUnlocked, 7);
  }

  setAimOnTarget(on) {
    if (!this._vrMode) this._crosshair.className = on ? 'on-target' : '';
  }

  announceWave(n) {
    this._elAnnounce.textContent  = `WAVE  ${n}`;
    this._elAnnounce.style.opacity = '1';
    clearTimeout(this._announceTimeout);
    this._announceTimeout = setTimeout(() => {
      this._elAnnounce.style.opacity = '0';
    }, 2200);
  }

  showOverlay() {}
  hideOverlay() {}
}
