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
    this._elEmpHint  = document.getElementById('hud-emp-hint');
    this._crosshair  = document.getElementById('crosshair');

    this._announceTimeout = null;

    this._buildAmmoRing();
    this._buildEmpRing();
    this._buildVRHUD(camera);
  }

  // ── Ammo ring (bottom-right, desktop) ────────────────────────
  _buildAmmoRing() {
    const c = document.createElement('canvas');
    c.width = c.height = 100;
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;pointer-events:none;z-index:100;';
    document.body.appendChild(c);
    this._ammoCanvas = c;
    this._ammoCtx    = c.getContext('2d');

    const lbl = document.createElement('div');
    lbl.style.cssText = [
      'position:fixed','bottom:5px','right:20px',
      'width:100px','text-align:center',
      'font-family:monospace','font-size:9px','letter-spacing:2px',
      'color:#336688','pointer-events:none','z-index:100',
    ].join(';');
    document.body.appendChild(lbl);
    this._rofLabel = lbl;

    this._drawAmmoArc(this._ammoCtx, 50, 50, 36, 50, 50, 7);
  }

  // ── EMP ring (bottom-left, desktop) ──────────────────────────
  _buildEmpRing() {
    const c = document.createElement('canvas');
    c.width = c.height = 100;
    c.style.cssText = 'position:fixed;bottom:20px;left:20px;pointer-events:none;z-index:100;';
    document.body.appendChild(c);
    this._empCanvas = c;
    this._empCtx    = c.getContext('2d');
    this._drawEmpArc(this._empCtx, 50, 50, 36, 0, false, 7, 0);
  }

  // ── VR HUD — scattered visor panels ──────────────────────────
  _buildVRHUD(camera) {
    this._vrGroup = new THREE.Group();
    this._vrGroup.visible = false;
    camera.add(this._vrGroup);

    const makePanel = (cw, ch, gw, gh) => {
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(gw, gh),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
      );
      mesh.renderOrder = 999;
      return { canvas, ctx, tex, mesh };
    };

    // ── Panel definitions ─────────────────────────────────────
    this._vp = {};

    // Top-left: SCORE + CREDITS
    this._vp.tl = makePanel(220, 110, 0.275, 0.138);
    this._vp.tl.mesh.position.set(-0.285, 0.215, -0.65);
    this._vp.tl.mesh.rotation.y = THREE.MathUtils.degToRad(8);
    this._vrGroup.add(this._vp.tl.mesh);

    // Top-center: WAVE
    this._vp.tc = makePanel(180, 74, 0.220, 0.090);
    this._vp.tc.mesh.position.set(0, 0.270, -0.65);
    this._vrGroup.add(this._vp.tc.mesh);

    // Top-right: DRONES + ROF
    this._vp.tr = makePanel(220, 110, 0.275, 0.138);
    this._vp.tr.mesh.position.set(0.285, 0.215, -0.65);
    this._vp.tr.mesh.rotation.y = THREE.MathUtils.degToRad(-8);
    this._vrGroup.add(this._vp.tr.mesh);

    // Health bar (bottom-center, wide thin bar)
    this._vp.hp = makePanel(512, 36, 0.600, 0.042);
    this._vp.hp.mesh.position.set(0, -0.230, -0.68);
    this._vrGroup.add(this._vp.hp.mesh);

    // EMP ring (bottom-left)
    this._vp.emp = makePanel(120, 120, 0.148, 0.148);
    this._vp.emp.mesh.position.set(-0.315, -0.115, -0.65);
    this._vp.emp.mesh.rotation.y = THREE.MathUtils.degToRad(6);
    this._vrGroup.add(this._vp.emp.mesh);

    // Ammo ring (bottom-right)
    this._vp.ammo = makePanel(120, 120, 0.148, 0.148);
    this._vp.ammo.mesh.position.set(0.315, -0.115, -0.65);
    this._vp.ammo.mesh.rotation.y = THREE.MathUtils.degToRad(-6);
    this._vrGroup.add(this._vp.ammo.mesh);
  }

  // ── VR panel background helper ────────────────────────────────
  _vrPanelBg(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);

    // Dark glass
    ctx.fillStyle = 'rgba(0,8,22,0.72)';
    ctx.beginPath();
    ctx.roundRect(2, 2, W - 4, H - 4, 5);
    ctx.fill();

    // Faint border
    ctx.strokeStyle = 'rgba(0,180,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Corner brackets
    const b = 7, l = 11;
    ctx.strokeStyle = 'rgba(0,200,255,0.65)';
    ctx.lineWidth = 1.5;
    // TL
    ctx.beginPath(); ctx.moveTo(b+l, b); ctx.lineTo(b, b); ctx.lineTo(b, b+l); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(W-b-l, b); ctx.lineTo(W-b, b); ctx.lineTo(W-b, b+l); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(b+l, H-b); ctx.lineTo(b, H-b); ctx.lineTo(b, H-b-l); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(W-b-l, H-b); ctx.lineTo(W-b, H-b); ctx.lineTo(W-b, H-b-l); ctx.stroke();
  }

  // ── Draw individual VR panels ─────────────────────────────────
  _drawVRHUD({ score, wave, drones, baseHP, ammo, maxAmmo,
               money, empFraction, empUnlocked, fireRate, empCooldown }) {

    // ── TOP-LEFT: Score + Credits ──────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.tl;
      const W = c.width, H = c.height;
      this._vrPanelBg(ctx, W, H);

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#2a5a7a'; ctx.font = '9px monospace';
      ctx.fillText('SCORE', 18, 26);
      ctx.fillStyle = '#00ccff'; ctx.font = 'bold 30px monospace';
      ctx.fillText(`${score}`, 18, 60);

      // Divider
      ctx.strokeStyle = 'rgba(0,160,200,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, 68); ctx.lineTo(W - 18, 68); ctx.stroke();

      ctx.fillStyle = '#2a5a7a'; ctx.font = '9px monospace';
      ctx.fillText('CREDITS', 18, 82);
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px monospace';
      ctx.fillText(`$${money}`, 18, 104);

      tex.needsUpdate = true;
    }

    // ── TOP-CENTER: Wave ──────────────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.tc;
      const W = c.width, H = c.height;
      this._vrPanelBg(ctx, W, H);

      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#2a5a7a'; ctx.font = '8px monospace';
      ctx.fillText('WAVE', W / 2, 24);
      ctx.fillStyle = '#00ccff'; ctx.font = 'bold 38px monospace';
      ctx.fillText(`${wave || '–'}`, W / 2, 62);

      tex.needsUpdate = true;
    }

    // ── TOP-RIGHT: Drones + ROF ───────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.tr;
      const W = c.width, H = c.height;
      this._vrPanelBg(ctx, W, H);

      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#2a5a7a'; ctx.font = '9px monospace';
      ctx.fillText('DRONES', W - 18, 26);
      ctx.fillStyle = '#00ccff'; ctx.font = 'bold 30px monospace';
      ctx.fillText(`${drones}`, W - 18, 60);

      ctx.strokeStyle = 'rgba(0,160,200,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(18, 68); ctx.lineTo(W - 18, 68); ctx.stroke();

      ctx.fillStyle = '#2a5a7a'; ctx.font = '9px monospace';
      ctx.fillText('FIRE RATE', W - 18, 82);
      ctx.fillStyle = '#88ddff'; ctx.font = 'bold 18px monospace';
      ctx.fillText(`${fireRate}/s`, W - 18, 104);

      tex.needsUpdate = true;
    }

    // ── HEALTH BAR ────────────────────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.hp;
      const W = c.width, H = c.height;
      this._vrPanelBg(ctx, W, H);

      const lx = 32, rx = W - 18, barH = 10, barY = (H - barH) / 2;

      // HP label
      ctx.fillStyle = '#2a5a7a'; ctx.font = '8px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('HP', lx, H / 2);

      const barX = lx + 22, barW = rx - barX;
      const pct  = Math.max(0, baseHP / 100);

      // Track
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(barX, barY, barW, barH);

      // Fill
      ctx.fillStyle = pct > 0.3 ? '#ff8800' : '#ff2200';
      if (pct > 0) {
        ctx.fillStyle = pct > 0.3 ? '#ff8800' : '#ff2200';
        ctx.fillRect(barX, barY, barW * pct, barH);
        // Glow
        ctx.fillStyle = pct > 0.3
          ? 'rgba(255,150,0,0.3)' : 'rgba(255,40,0,0.3)';
        ctx.fillRect(barX, barY - 2, barW * pct, barH + 4);
      }

      // Border
      ctx.strokeStyle = 'rgba(255,100,0,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Tick marks every 25%
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
      for (let t = 1; t < 4; t++) {
        const tx = barX + barW * (t / 4);
        ctx.beginPath(); ctx.moveTo(tx, barY); ctx.lineTo(tx, barY + barH); ctx.stroke();
      }

      // Percentage text
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(baseHP)}%`, barX + barW / 2, H / 2);

      tex.needsUpdate = true;
    }

    // ── EMP ring ──────────────────────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.emp;
      ctx.clearRect(0, 0, c.width, c.height);
      this._drawEmpArc(ctx, 60, 60, 48, empFraction, empUnlocked, 8, empCooldown);
      tex.needsUpdate = true;
    }

    // ── Ammo ring ─────────────────────────────────────────────
    {
      const { ctx, canvas: c, tex } = this._vp.ammo;
      ctx.clearRect(0, 0, c.width, c.height);
      this._drawAmmoArc(ctx, 60, 60, 48, ammo, maxAmmo, 8);
      tex.needsUpdate = true;
    }
  }

  // ── Arc drawing helpers ───────────────────────────────────────

  _drawAmmoArc(ctx, cx, cy, r, ammo, maxAmmo, lineW) {
    const frac = maxAmmo > 0 ? ammo / maxAmmo : 0;
    ctx.save();

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
      ctx.lineWidth = lineW;
      ctx.lineCap   = 'round';
      ctx.stroke();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a6a8a'; ctx.font = `7px monospace`;
    ctx.fillText('AMMO', cx, cy - r * 0.55);
    ctx.fillStyle = ammo === 0 ? '#ff4455' : '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.44)}px monospace`;
    ctx.fillText(`${ammo}`, cx, cy - r * 0.10);
    ctx.fillStyle = '#556677';
    ctx.font = `${Math.round(r * 0.28)}px monospace`;
    ctx.fillText(`/${maxAmmo}`, cx, cy + r * 0.36);

    ctx.restore();
  }

  _drawEmpArc(ctx, cx, cy, r, readyFraction, unlocked, lineW, cooldownSec = 0) {
    ctx.save();

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
      if (readyFraction >= 1) { ctx.shadowBlur = 8; ctx.shadowColor = '#ff00ff'; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a6a8a'; ctx.font = `7px monospace`;
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
      ctx.fillStyle = '#aa66cc';
      ctx.font = `bold ${Math.round(r * 0.38)}px monospace`;
      ctx.fillText(`${Math.ceil(cooldownSec)}s`, cx, cy + r * 0.10);
    }

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────

  enterVR() {
    this._vrMode = true;
    this._vrGroup.visible = true;
    this._ammoCanvas.style.display = 'none';
    this._empCanvas.style.display  = 'none';
    this._rofLabel.style.display   = 'none';
    document.getElementById('hud-topleft').style.display     = 'none';
    document.getElementById('hud-topcenter').style.display   = 'none';
    document.getElementById('hud-topright').style.display    = 'none';
    document.getElementById('hud-bottomcenter').style.display= 'none';
    document.getElementById('crosshair').style.display       = 'none';
    document.getElementById('visor-overlay').style.display   = 'none';
  }

  exitVR() {
    this._vrMode = false;
    this._vrGroup.visible = false;
    this._ammoCanvas.style.display = '';
    this._empCanvas.style.display  = '';
    this._rofLabel.style.display   = '';
    document.getElementById('hud-topleft').style.display     = '';
    document.getElementById('hud-topcenter').style.display   = '';
    document.getElementById('hud-topright').style.display    = '';
    document.getElementById('hud-bottomcenter').style.display= '';
    document.getElementById('crosshair').style.display       = '';
    document.getElementById('visor-overlay').style.display   = '';
  }

  update({ score, wave, drones, baseHP,
           ammo = 50, maxAmmo = 50,
           money = 0, empFraction = 0, empUnlocked = false,
           empCooldown = 0, fireRate = 5 }) {

    if (this._vrMode) {
      this._drawVRHUD({ score, wave, drones, baseHP, ammo, maxAmmo,
                        money, empFraction, empUnlocked, empCooldown, fireRate });
      return;
    }

    // ── DOM updates ──────────────────────────────────────────
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
        this._elEmpHint.textContent = `EMP ${Math.ceil(empCooldown)}s`;
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
    this._drawEmpArc(ectx, 50, 50, 36, empFraction, empUnlocked, 7, empCooldown);
  }

  setAimOnTarget(on) {
    if (!this._vrMode) this._crosshair.className = on ? 'on-target' : '';
  }

  announceWave(label) {
    this._elAnnounce.textContent   = typeof label === 'number' ? `WAVE  ${label}` : label;
    this._elAnnounce.style.opacity = '1';
    clearTimeout(this._announceTimeout);
    this._announceTimeout = setTimeout(() => {
      this._elAnnounce.style.opacity = '0';
    }, 2200);
  }

  showOverlay() {}
  hideOverlay() {}
}
