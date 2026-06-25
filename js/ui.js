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

  _drawVRHUD(score, wave, drones, baseHP) {
    const ctx = this._vrCtx;
    const W = 512, H = 110;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,10,20,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,204,255,0.3)';
    ctx.strokeRect(1, 1, W - 2, H - 2);

    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`SCORE  ${score}`, 14, 28);
    ctx.fillText(`WAVE   ${wave}`, 200, 28);
    ctx.fillText(`DRONES ${drones}`, 370, 28);

    // HP bar
    ctx.fillStyle = '#334';
    ctx.fillRect(14, 42, W - 28, 14);
    ctx.fillStyle = baseHP > 30 ? '#ff8800' : '#ff2200';
    ctx.fillRect(14, 42, (W - 28) * (baseHP / 100), 14);
    ctx.fillStyle = '#4488aa';
    ctx.font = '10px monospace';
    ctx.fillText('PLAYER HEALTH', 14, 72);

    this._vrTexture.needsUpdate = true;
  }

  // ── Public API ────────────────────────────────────────────────

  enterVR() {
    this._vrMode = true;
    this._vrHUDGroup.visible = true;
    document.getElementById('ui').style.display        = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('base-hp-bar').style.display = 'none';
  }

  exitVR() {
    this._vrMode = false;
    this._vrHUDGroup.visible = false;
    document.getElementById('ui').style.display        = '';
    document.getElementById('crosshair').style.display = '';
    document.getElementById('base-hp-bar').style.display = '';
  }

  // Called every frame with current game state.
  update({ score, wave, drones, baseHP }) {
    if (this._vrMode) {
      this._drawVRHUD(score, wave, drones, baseHP);
      return;
    }

    this._elScore.textContent    = score;
    this._elWave.textContent     = wave || '–';
    this._elDrones.textContent   = drones;
    this._elBaseFill.style.width = baseHP + '%';
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
