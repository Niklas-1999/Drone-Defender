import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ── Upgrade catalogue ──────────────────────────────────────────────────────
// Each entry: id, col(0-2), row(0-2), name, desc, cost(fn), maxLevel, requires
const UPGRADES = [
  // GUN (column 0)
  { id: 'ammo_cap',    col: 0, row: 0, name: 'AMMO CAPACITY', desc: '+15 ammo / level',
    cost: l => 50 + l * 30, maxLevel: 5,
    apply(game, lvl) { game.turret.setMaxAmmo(50 + lvl * 15); } },

  { id: 'fire_rate',   col: 0, row: 1, name: 'FIRE RATE',     desc: '+25% speed / level',
    cost: l => 75 + l * 40, maxLevel: 5,
    apply(game, lvl) { game.turret.setFireCooldown(0.20 * Math.pow(0.80, lvl)); } },

  // TURRET (column 1)
  { id: 'turret_l',    col: 1, row: 0, name: 'AUTO TURRET L', desc: 'Left auto-targeting turret',
    cost: () => 150, maxLevel: 1,
    apply(game) { game.buyAutoTurret('left'); } },

  { id: 'turret_r',    col: 1, row: 1, name: 'AUTO TURRET R', desc: 'Right auto-targeting turret',
    cost: () => 150, maxLevel: 1,
    apply(game) { game.buyAutoTurret('right'); } },

  { id: 'turret_rate', col: 1, row: 2, name: 'TURRET RATE',   desc: '×1.5 fire speed / level',
    cost: l => 100 + l * 60, maxLevel: 3, requires: ['turret_l', 'turret_r'],
    apply(game, lvl) { game.upgradeAutoTurretRate(lvl); } },

  // EMP (column 2)
  { id: 'buy_emp',     col: 2, row: 0, name: 'BUY EMP',       desc: 'Stun all drones 1s\n[E] / [X button]',
    cost: () => 100, maxLevel: 1,
    apply(game) { game.emp.unlocked = true; } },

  { id: 'emp_cd',      col: 2, row: 1, name: 'EMP COOLDOWN',  desc: '-3s cooldown / level',
    cost: l => 75 + l * 50, maxLevel: 5, requires: ['buy_emp'],
    apply(game, lvl) { game.emp.cooldownMax = Math.max(5, 15 - lvl * 3); } },

  { id: 'emp_stun',    col: 2, row: 2, name: 'STUN DURATION', desc: '+0.5s stun / level',
    cost: l => 60 + l * 40, maxLevel: 5, requires: ['buy_emp'],
    apply(game, lvl) { game.emp.stunDuration = 1.0 + lvl * 0.5; } },
];

const COL_HEADERS = ['GUN UPGRADES', 'TURRET UPGRADES', 'EMP'];

// Canvas dimensions
const CW = 900, CH = 580;
const COL_W = 300, COL_X = [0, 300, 600]; // each column x start
const ROW_H = 140, ROW_Y = 110;            // first item row start
const BTN_W = 130, BTN_H = 28;

export class ShopSystem {
  constructor(scene, camera) {
    this._scene  = scene;
    this._camera = camera;

    // Per-upgrade purchased levels, keyed by id
    this.levels = {};

    this._buildPanel();
  }

  _buildPanel() {
    const canvas = document.createElement('canvas');
    canvas.width  = CW;
    canvas.height = CH;
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._tex     = new THREE.CanvasTexture(canvas);

    this._panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.32),
      new THREE.MeshBasicMaterial({
        map: this._tex, transparent: true,
        side: THREE.DoubleSide, depthTest: false,
      })
    );
    this._panel.position.set(0, 1.55, -3.5);
    this._panel.visible = false;
    this._scene.add(this._panel);

    // Button hit zones stored as { id, x, y, w, h } in canvas coords
    this._btnZones     = [];
    this._continueBtnY = CH - 60;
    this._hoverBtn     = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  open(waveNumber, money, upgradeLevels) {
    this.levels = { ...upgradeLevels };
    this._panel.visible = true;
    this._wave   = waveNumber;
    this.draw(money);
    this._trigWas = false;
  }

  close() { this._panel.visible = false; }

  // Call every frame while in shop state.
  // Returns button id (or 'continue') on VR trigger press, else null.
  update(dt, input, vrMode, money) {
    this._updateHover(input, vrMode, money);
    if (vrMode && input.consumeTriggerJustPressed()) {
      return this._hoverBtn; // null if not pointing at a button
    }
    return null;
  }

  // Raycast every frame to track hover, redraw when it changes.
  _updateHover(input, vrMode, money) {
    if (!vrMode || !this._panel.visible) {
      if (this._hoverBtn !== null) { this._hoverBtn = null; this.draw(money); }
      return;
    }

    const rc = new THREE.Raycaster();
    const q  = new THREE.Quaternion();
    let newHover = null;

    for (const ctrl of [input.getRightController(), input.getLeftController()]) {
      if (!ctrl) continue;
      const pos = new THREE.Vector3();
      ctrl.getWorldPosition(pos);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(q));
      rc.set(pos, dir.normalize());
      const hits = rc.intersectObject(this._panel);
      if (hits.length && hits[0].uv) { newHover = this._hitTest(hits[0].uv); break; }
    }

    if (newHover !== this._hoverBtn) { this._hoverBtn = newHover; this.draw(money); }
  }

  // Returns button id string (or 'continue') at UV, or null
  _hitTest(uv) {
    const cx = uv.x * CW;
    const cy = (1 - uv.y) * CH;

    // Continue button
    if (cx >= 300 && cx <= 600 && cy >= this._continueBtnY - 5 && cy <= this._continueBtnY + BTN_H + 5) {
      return 'continue';
    }
    for (const z of this._btnZones) {
      if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) {
        return z.id;
      }
    }
    return null;
  }

  // Returns the upgrade def for an id
  getUpgrade(id) { return UPGRADES.find(u => u.id === id); }

  draw(money) {
    const ctx = this._ctx;
    const lvl = this.levels;
    this._btnZones = [];

    // Background
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = 'rgba(0,6,18,0.96)';
    this._roundRect(ctx, 4, 4, CW - 8, CH - 8, 14);
    ctx.fill();
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    this._roundRect(ctx, 4, 4, CW - 8, CH - 8, 14);
    ctx.stroke();

    // Header
    ctx.fillStyle = '#00ddff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`◈ WAVE ${this._wave} COMPLETE — SHOP ◈`, CW / 2, 32);

    // Money
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`💰  $${money}`, CW / 2, 62);

    // Column dividers
    ctx.strokeStyle = 'rgba(0,150,255,0.2)';
    ctx.lineWidth = 1;
    for (const x of [300, 600]) {
      ctx.beginPath(); ctx.moveTo(x, 85); ctx.lineTo(x, CH - 70); ctx.stroke();
    }

    // Columns
    for (let col = 0; col < 3; col++) {
      const cx = COL_X[col] + COL_W / 2;

      // Column header
      ctx.fillStyle = '#00aaff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(COL_HEADERS[col], cx, 96);

      // Items in this column
      const items = UPGRADES.filter(u => u.col === col);
      for (const u of items) {
        const iy  = ROW_Y + u.row * ROW_H;
        const ix  = COL_X[col] + 14;
        const iw  = COL_W - 28;
        const lvlNow = lvl[u.id] ?? 0;
        const maxed  = lvlNow >= u.maxLevel;
        const locked = u.requires?.some(r => !(lvl[r] ?? 0)) ?? false;
        const cost   = u.cost(lvlNow);
        const canBuy = !maxed && !locked && money >= cost;

        // Item bg
        ctx.fillStyle = locked
          ? 'rgba(20,20,30,0.6)'
          : canBuy
            ? 'rgba(0,30,50,0.75)'
            : 'rgba(10,15,25,0.75)';
        this._roundRect(ctx, ix, iy, iw, ROW_H - 10, 6);
        ctx.fill();
        ctx.strokeStyle = locked ? '#223' : maxed ? '#ffd700' : '#00556f';
        ctx.lineWidth = 1;
        this._roundRect(ctx, ix, iy, iw, ROW_H - 10, 6);
        ctx.stroke();

        // Name
        ctx.fillStyle = locked ? '#445' : maxed ? '#ffd700' : '#00ccff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(u.name, ix + 8, iy + 16);

        // Level pips
        if (u.maxLevel > 1) {
          for (let p = 0; p < u.maxLevel; p++) {
            ctx.fillStyle = p < lvlNow ? '#00ccff' : '#1a2a38';
            ctx.fillRect(ix + 8 + p * 16, iy + 24, 12, 5);
          }
        }

        // Description (may be two lines with \n)
        ctx.fillStyle = locked ? '#334' : '#6699aa';
        ctx.font = '10px monospace';
        u.desc.split('\n').forEach((line, li) => {
          ctx.fillText(line, ix + 8, iy + 38 + li * 12);
        });

        // Cost / status
        if (maxed) {
          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('MAX LEVEL', ix + 8, iy + 68);
        } else if (locked) {
          ctx.fillStyle = '#445';
          ctx.font = '10px monospace';
          ctx.fillText('[ LOCKED ]', ix + 8, iy + 68);
        } else {
          ctx.fillStyle = money >= cost ? '#ffd700' : '#884400';
          ctx.font = `bold 11px monospace`;
          ctx.fillText(`$${cost}`, ix + 8, iy + 68);

          // BUY button
          const bx      = ix + iw - BTN_W - 6;
          const by      = iy + ROW_H - 10 - BTN_H - 6;
          const hovered = this._hoverBtn === u.id;
          this._drawBtn(ctx, bx, by, BTN_W, BTN_H, 'BUY',
            hovered ? '#00ffff' : (canBuy ? '#00ff88' : '#2a4a3a'),
            hovered ? '#005544' : (canBuy ? '#003318' : '#0a1a10'));
          if (!maxed && !locked) {
            this._btnZones.push({ id: u.id, x: bx, y: by, w: BTN_W, h: BTN_H });
          }
        }
      }
    }

    // CONTINUE button
    const cby     = this._continueBtnY;
    const contHov = this._hoverBtn === 'continue';
    this._drawBtn(ctx, 300, cby, 300, BTN_H + 8, '▶  CONTINUE TO NEXT WAVE',
      contHov ? '#00ffff' : '#00ffee',
      contHov ? '#00505a' : '#002a30');
    ctx.textAlign = 'center'; // reset after drawBtn

    // Desktop hint
    ctx.fillStyle = '#334455';
    ctx.font = '9px monospace';
    ctx.fillText('Desktop: 1–9 buy  |  0 / SPACE continue  |  VR: aim + trigger', CW / 2, CH - 8);

    this._tex.needsUpdate = true;
  }

  _drawBtn(ctx, x, y, w, h, label, border, fill) {
    ctx.fillStyle = fill;
    this._roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();
    ctx.fillStyle = border;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Map keyboard keys 1-9 to upgrade id or 'continue' for 0
  keyToId(key) {
    const map = [
      null,           // 0 = continue (handled separately)
      'ammo_cap',    // 1
      'fire_rate',   // 2
      null,          // 3 (gap in gun column)
      'turret_l',    // 4
      'turret_r',    // 5
      'turret_rate', // 6
      'buy_emp',     // 7
      'emp_cd',      // 8
      'emp_stun',    // 9
    ];
    const n = parseInt(key);
    if (n === 0) return 'continue';
    return (!isNaN(n) && n >= 1 && n <= 9) ? map[n] : null;
  }

  resetUpgrades() { this.levels = {}; }
}
