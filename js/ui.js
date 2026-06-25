import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Manages the HTML HUD and an in-world VR HUD canvas plane.
export class UIManager {
  constructor(camera) {
    this._camera  = camera;
    this._vrMode  = false;

    // DOM refs
    this._elScore   = document.getElementById('hud-score');
    this._elWave    = document.getElementById('hud-wave');
    this._elDrones  = document.getElementById('hud-drones');
    this._elBaseFill = document.getElementById('base-hp-fill');
    this._elAnnounce = document.getElementById('wave-announce');
    this._elOverlay  = document.getElementById('overlay');
    this._crosshair  = document.getElementById('crosshair');

    this._announceTimeout = null;

    this._buildVRHUD(camera);
    this._buildAmmoRing();
  }

  // ── Desktop ammo ring ─────────────────────────────────────────
  _buildAmmoRing() {
    const c = document.createElement('canvas');
    c.width = c.height = 100;
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;pointer-events:none;z-index:100;';
    document.body.appendChild(c);
    this._ammoCanvas = c;
    this._ammoCtx    = c.getContext('2d');
    this._drawAmmoArc(this._ammoCtx, 50, 50, 36, 50, 50, 7);
  }

  // Shared helper — draws the hollow arc ring centered at (cx,cy) with radius r.
  _drawAmmoArc(ctx, cx, cy, r, ammo, maxAmmo, lineW) {
    const frac = maxAmmo > 0 ? ammo / maxAmmo : 0;
    ctx.save();

    // Dark track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(20,20,40,0.85)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    // Coloured arc (green → yellow → red)
    if (ammo > 0) {
      const hue = Math.round(frac * 120); // 120 = green, 0 = red
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
      ctx.strokeStyle = `hsl(${hue},90%,55%)`;
      ctx.lineWidth   = lineW;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    // Text: current on top, "/max" below
    const bigSize   = Math.round(r * 0.44);
    const smallSize = Math.round(r * 0.30);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ammo === 0 ? '#ff4455' : '#ffffff';
    ctx.font = `bold ${bigSize}px monospace`;
    ctx.fillText(`${ammo}`, cx, cy - r * 0.16);
    ctx.fillStyle = '#8899aa';
    ctx.font = `${smallSize}px monospace`;
    ctx.fillText(`/${maxAmmo}`, cx, cy + r * 0.35);

    ctx.restore();
  }

  // ── VR HUD ────────────────────────────────────────────────────
  _buildVRHUD(camera) {
    const canvas = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 160;
    this._vrCanvas  = canvas;
    this._vrCtx     = canvas.getContext('2d');
    this._vrTexture = new THREE.CanvasTexture(canvas);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.17),
      new THREE.MeshBasicMaterial({
        map: this._vrTexture,
        transparent: true,
        depthTest: false,
      })
    );
    mesh.position.set(0, -0.28, -0.75);
    this._vrHUDMesh = mesh;

    this._vrHUDGroup = new THREE.Group();
    this._vrHUDGroup.add(mesh);
    this._vrHUDGroup.visible = false;
    camera.add(this._vrHUDGroup);
  }

  _drawVRHUD(score, wave, drones, baseHP, ammo = 50, maxAmmo = 50) {
    const ctx = this._vrCtx;
    const W = 512, H = 160;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,10,20,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,204,255,0.3)';
    ctx.strokeRect(1, 1, W - 2, H - 2);

    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`SCORE  ${score}`, 14, 28);
    ctx.fillText(`WAVE   ${wave}`, 180, 28);
    ctx.fillText(`DRONES ${drones}`, 330, 28);

    // HP bar
    ctx.fillStyle = '#334';
    ctx.fillRect(14, 42, W - 28, 14);
    ctx.fillStyle = baseHP > 30 ? '#ff8800' : '#ff2200';
    ctx.fillRect(14, 42, (W - 28) * (baseHP / 100), 14);
    ctx.fillStyle = '#4488aa';
    ctx.font = '10px monospace';
    ctx.fillText('PLAYER HEALTH', 14, 72);

    // Ammo ring — right-hand side
    ctx.clearRect(380, 78, 128, 76);
    this._drawAmmoArc(ctx, 455, 118, 32, ammo, maxAmmo, 6);

    this._vrTexture.needsUpdate = true;
  }

  // ── Public API ────────────────────────────────────────────────

  enterVR() {
    this._vrMode = true;
    this._vrHUDGroup.visible = true;
    this._ammoCanvas.style.display = 'none';
    document.getElementById('ui').style.display        = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('base-hp-bar').style.display = 'none';
  }

  exitVR() {
    this._vrMode = false;
    this._vrHUDGroup.visible = false;
    this._ammoCanvas.style.display = '';
    document.getElementById('ui').style.display        = '';
    document.getElementById('crosshair').style.display = '';
    document.getElementById('base-hp-bar').style.display = '';
  }

  // Called every frame with current game state.
  update({ score, wave, drones, baseHP, ammo = 50, maxAmmo = 50 }) {
    if (this._vrMode) {
      this._drawVRHUD(score, wave, drones, baseHP, ammo, maxAmmo);
      return;
    }

    this._elScore.textContent    = score;
    this._elWave.textContent     = wave || '–';
    this._elDrones.textContent   = drones;
    this._elBaseFill.style.width = baseHP + '%';

    // Desktop ammo ring
    const ctx = this._ammoCtx;
    ctx.clearRect(0, 0, 100, 100);
    this._drawAmmoArc(ctx, 50, 50, 36, ammo, maxAmmo, 7);
  }

  setAimOnTarget(onTarget) {
    if (!this._vrMode) {
      this._crosshair.className = onTarget ? 'on-target' : '';
    }
  }

  announceWave(n) {
    this._elAnnounce.textContent = `WAVE  ${n}`;
    this._elAnnounce.style.opacity = '1';
    clearTimeout(this._announceTimeout);
    this._announceTimeout = setTimeout(() => {
      this._elAnnounce.style.opacity = '0';
    }, 2200);
  }

  showOverlay(title, sub, btnLabel = 'START GAME') {
    this._elOverlayTitle.textContent = title;
    this._elOverlaySub.textContent   = sub;
    document.getElementById('overlay-btn').textContent = btnLabel;
    this._elOverlay.classList.remove('hidden');
  }

  hideOverlay() {
    this._elOverlay.classList.add('hidden');
  }
}
