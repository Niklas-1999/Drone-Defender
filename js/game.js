import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { VRButton }          from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/webxr/VRButton.js';
import { SceneBuilder }      from './scene.js';
import { AudioSystem }       from './audio.js';
import { UIManager }         from './ui.js';
import { ParticleSystem }    from './particles.js';
import { ProjectileManager } from './projectiles.js';
import { Turret }            from './turret.js';
import { InputManager }      from './input.js';
import { WaveManager }       from './waves.js';
import { EMP }               from './emp.js';
import { AutoTurret }        from './autoturret.js';
import { ShopSystem }        from './shop.js';
import { Boss, Missile, Boss2, ShieldOrb } from './boss.js';

// Money awarded per drone kill by type
const KILL_MONEY = { scout: 10, warrior: 20, titan: 30 };

// Wave structure: 18 total, boss waves at 6, 12, 18
const MAX_WAVE  = 18;
const BOSS_WAVES = new Set([6, 12, 18]);

// Period boundaries: 1-6 day, 7-12 evening, 13-18 night
const MUSIC_VOL = 0.55;

export class Game {
  constructor() {
    this.state    = 'menu';
    this.score    = 0;
    this.wave     = 0;
    this.playerHP = 100;
    this.money    = 0;
    this.drones   = [];
    this.vrMode   = false;

    this._lastTime         = 0;
    this._currentPeriod    = 'day';   // 'day' | 'evening' | 'night'
    this._skyTransitioning = false;
    this._emptyGunPlayed   = false;
    this._hpAtWaveStart    = 100;
    this._fireworkTimer    = 0;

    // Upgrade levels (keyed by upgrade id) — persisted through waves, reset on new game
    this._upgradeLevels = {};

    // Auto turrets — null until purchased
    this._autoTurrets = { left: null, right: null };

    // Boss state (set in _launchWave for boss waves)
    this._boss         = null;
    this._bossMissiles = [];

    // Music — three period groups, each with two tracks
    this._musicGroups   = null;
    this._musicPeriod   = 'day';
    this._musicIdx      = 0;
    this._musicFadeOut  = null; // { track, elapsed, dur }
    this._musicFadeIn   = null; // { track, elapsed, dur }
    this._pendingPeriod = null; // period waiting for fade-out to finish

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initMusic();
    this._buildInfoPanel();
    this._buildCheatMenu();
    this._buildBossHPBar();

    this.renderer.setAnimationLoop((t, frame) => this._loop(t, frame));
  }

  // ── Renderer & XR ─────────────────────────────────────────────
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.75;
    document.body.appendChild(this.renderer.domElement);

    document.getElementById('vr-button-container')
      .appendChild(VRButton.createButton(this.renderer));

    this.renderer.xr.addEventListener('sessionstart', () => {
      this.vrMode = true;
      this.ui.enterVR();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.vrMode = false;
      this.ui.exitVR();
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // ── Scene & camera ────────────────────────────────────────────
  _initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 500
    );
    this.camera.position.set(0, 1.6, 0);

    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    this.sceneBuilder = new SceneBuilder(this.scene);
    this.sceneBuilder.build();
  }

  // ── Systems ───────────────────────────────────────────────────
  _initSystems() {
    this.audio       = new AudioSystem();
    this.particles   = new ParticleSystem(this.scene);
    this.projectiles = new ProjectileManager(this.scene);
    this.ui          = new UIManager(this.camera);

    this.turret = new Turret(
      this.scene, this.camera, this.cameraRig, this.renderer
    );

    this._turretLight = new THREE.PointLight(0xffeedd, 0, 8);
    this._turretLight.position.set(0, 2, -0.8);
    this.cameraRig.add(this._turretLight);

    this.input = new InputManager(
      this.renderer, this.cameraRig, this.camera, this.scene
    );

    this.waves = new WaveManager(this.scene);
    this.emp   = new EMP();
    this.shop  = new ShopSystem(this.scene, this.camera);
  }

  // ── Music ─────────────────────────────────────────────────────
  _initMusic() {
    const make = (f1, f2) => {
      const t1 = new Audio(`assets/Music/${f1}`);
      const t2 = new Audio(`assets/Music/${f2}`);
      t1.volume = t2.volume = 0;
      return [t1, t2];
    };

    this._musicGroups = {
      day:     make('Neon Alley Raid.mp3',       'Neon Alley Raid 2.mp3'),
      evening: make('Neon Rift Battle.mp3',    'Neon Rift Battle 2.mp3'),
      night:   make('Neon Skyline Clash.mp3', 'Neon Skyline Clash 2.mp3'),
    };

    // When a track ends, automatically cycle to the other in the same period
    for (const [period, [t0, t1]] of Object.entries(this._musicGroups)) {
      t0.addEventListener('ended', () => {
        if (this._musicPeriod !== period || this._musicFadeOut) return;
        this._musicIdx = 1;
        t1.currentTime = 0; t1.volume = MUSIC_VOL;
        t1.play().catch(() => {});
      });
      t1.addEventListener('ended', () => {
        if (this._musicPeriod !== period || this._musicFadeOut) return;
        this._musicIdx = 0;
        t0.currentTime = 0; t0.volume = MUSIC_VOL;
        t0.play().catch(() => {});
      });
    }
  }

  _startMusic() {
    this._stopAllMusic();
    this._musicPeriod = this._currentPeriod;
    this._musicIdx    = Math.random() < 0.5 ? 0 : 1;
    const track = this._musicGroups[this._musicPeriod][this._musicIdx];
    track.currentTime = 0;
    track.volume      = MUSIC_VOL;
    track.play().catch(() => {});
  }

  _stopAllMusic() {
    for (const [t0, t1] of Object.values(this._musicGroups)) {
      t0.pause(); t0.currentTime = 0; t0.volume = 0;
      t1.pause(); t1.currentTime = 0; t1.volume = 0;
    }
    this._musicFadeOut  = null;
    this._musicFadeIn   = null;
    this._pendingPeriod = null;
  }

  _stopMusic() { this._stopAllMusic(); }

  _switchMusicPeriod(newPeriod) {
    if (newPeriod === this._musicPeriod) return;

    const playing = this._musicGroups[this._musicPeriod][this._musicIdx];
    if (!playing.paused && playing.volume > 0) {
      this._musicFadeOut = { track: playing, elapsed: 0, dur: 2.0 };
    }
    // Redirect ended-event routing immediately
    this._musicPeriod   = newPeriod;
    this._pendingPeriod = newPeriod;
  }

  _updateMusic(dt) {
    if (this._musicFadeOut) {
      this._musicFadeOut.elapsed += dt;
      const t = Math.min(this._musicFadeOut.elapsed / this._musicFadeOut.dur, 1);
      this._musicFadeOut.track.volume = MUSIC_VOL * (1 - t);
      if (t >= 1) {
        this._musicFadeOut.track.pause();
        this._musicFadeOut = null;
        if (this._pendingPeriod) {
          this._musicIdx = Math.random() < 0.5 ? 0 : 1;
          const newTrack = this._musicGroups[this._pendingPeriod][this._musicIdx];
          newTrack.currentTime = 0;
          newTrack.volume = 0;
          newTrack.play().catch(() => {});
          this._musicFadeIn   = { track: newTrack, elapsed: 0, dur: 2.0 };
          this._pendingPeriod = null;
        }
      }
    }

    if (this._musicFadeIn) {
      this._musicFadeIn.elapsed += dt;
      const t = Math.min(this._musicFadeIn.elapsed / this._musicFadeIn.dur, 1);
      this._musicFadeIn.track.volume = MUSIC_VOL * t;
      if (t >= 1) {
        this._musicFadeIn.track.volume = MUSIC_VOL;
        this._musicFadeIn = null;
      }
    }
  }

  // ── 3-D info panel (start / game-over / win) ──────────────────
  _buildInfoPanel() {
    const W = 512, H = 340;
    this._panelCanvas        = document.createElement('canvas');
    this._panelCanvas.width  = W;
    this._panelCanvas.height = H;
    this._panelCtx = this._panelCanvas.getContext('2d');
    this._panelTex = new THREE.CanvasTexture(this._panelCanvas);

    this._infoPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.6),
      new THREE.MeshBasicMaterial({
        map: this._panelTex, transparent: true,
        side: THREE.DoubleSide, depthTest: false,
      })
    );
    this._infoPanel.position.set(0, 1.55, -3);
    this.scene.add(this._infoPanel);

    this._panelBtnHovered = false;
    this._panelBtnUV      = null;

    this._drawInfoPanel('menu', 0, 0);
  }

  _drawInfoPanel(panelState, score, wave) {
    const ctx = this._panelCtx;
    const W = 512, H = 340;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(0,8,28,0.92)';
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 18);
    ctx.fill();
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';

    const hov = this._panelBtnHovered;

    if (panelState === 'menu') {
      ctx.fillStyle = '#00ddff';
      ctx.font = 'bold 40px monospace';
      ctx.fillText('VR DRONE DEFENDER', W / 2, 65);

      ctx.fillStyle = '#aaaacc';
      ctx.font = '21px monospace';
      ctx.fillText('Defend the city from incoming drones', W / 2, 110);
      ctx.fillText('Grab the turret and open fire', W / 2, 140);

      ctx.fillStyle = '#555577';
      ctx.font = '20px monospace';
      ctx.fillText('────────────────────────', W / 2, 170);

      this._drawPanelBtn(ctx, W / 2, 220, 200, 52, '▶  START',
        hov ? '#88ffee' : '#00ffee',
        hov ? '#004a50' : '#002a30');

      this._panelBtnUV = { x0: 0.305, x1: 0.695, y0: 0.276, y1: 0.429 };

      ctx.fillStyle = '#666688';
      ctx.font = '18px monospace';
      ctx.fillText('VR: aim controller at this panel + trigger', W / 2, 296);
      ctx.fillText('Desktop: Press SPACE', W / 2, 318);
      ctx.fillStyle = '#334455';
      ctx.font = '13px monospace';
      ctx.fillText('` (backtick) — cheat menu', W / 2, 334);

    } else if (panelState === 'gameover') {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 52px monospace';
      ctx.fillText('GAME OVER', W / 2, 72);

      ctx.fillStyle = '#ffffff';
      ctx.font = '34px monospace';
      ctx.fillText(`Wave  ${wave}`, W / 2, 142);
      ctx.fillText(`Score ${score}`, W / 2, 186);

      ctx.fillStyle = '#555577';
      ctx.font = '20px monospace';
      ctx.fillText('────────────────────────', W / 2, 220);

      this._drawPanelBtn(ctx, W / 2, 272, 240, 52, '↺  TRY AGAIN',
        hov ? '#ffee88' : '#ffcc44',
        hov ? '#4a3800' : '#2a1a00');

      this._panelBtnUV = { x0: 0.266, x1: 0.734, y0: 0.124, y1: 0.276 };

      ctx.fillStyle = '#666688';
      ctx.font = '18px monospace';
      ctx.fillText('Desktop: Press SPACE', W / 2, 324);

    } else if (panelState === 'win') {
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 50px monospace';
      ctx.fillText('YOU WIN!', W / 2, 70);

      ctx.fillStyle = '#aaffcc';
      ctx.font = '20px monospace';
      ctx.fillText('All 18 waves cleared!', W / 2, 108);

      ctx.fillStyle = '#ffffff';
      ctx.font = '30px monospace';
      ctx.fillText(`Score  ${score}`, W / 2, 156);

      ctx.fillStyle = '#555577';
      ctx.font = '20px monospace';
      ctx.fillText('────────────────────────', W / 2, 192);

      this._drawPanelBtn(ctx, W / 2, 258, 240, 52, '↺  PLAY AGAIN',
        hov ? '#aaffcc' : '#00ff88',
        hov ? '#004a20' : '#003018');

      this._panelBtnUV = { x0: 0.266, x1: 0.734, y0: 0.124, y1: 0.276 };

      ctx.fillStyle = '#666688';
      ctx.font = '18px monospace';
      ctx.fillText('Desktop: Press SPACE', W / 2, 324);
    }

    this._panelTex.needsUpdate = true;
  }

  _drawPanelBtn(ctx, cx, cy, bw, bh, label, borderCol, fillCol) {
    const x = cx - bw / 2, y = cy - bh / 2;
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = borderCol;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Wave helpers ──────────────────────────────────────────────
  _isBossWave(w)  { return BOSS_WAVES.has(w); }

  _getPeriod(w) {
    if (w <= 6)  return 'day';
    if (w <= 12) return 'evening';
    return 'night';
  }

  // Human-readable wave label for the HUD / announcer
  _waveLabel(w) {
    if (this._isBossWave(w)) return 'BOSS WAVE';
    const bossCount = [6, 12, 18].filter(b => b < w).length;
    return `WAVE  ${w - bossCount}`;
  }

  // Number (or 'BOSS') shown in the wave HUD counter
  _waveDisplay(w) {
    if (this._isBossWave(w)) return 'BOSS';
    const bossCount = [6, 12, 18].filter(b => b < w).length;
    return w - bossCount;
  }

  // ── Start / restart ───────────────────────────────────────────
  start() {
    if (!this.audio.initialized) this.audio.init();

    this.state    = 'playing';
    this.score    = 0;
    this.wave     = 0;
    this.playerHP = 100;
    this.money    = 0;

    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();

    // Destroy boss / missiles
    if (this._boss) { this._boss.destroy(); this._boss = null; }
    for (const m of this._bossMissiles) m.destroy();
    this._bossMissiles = [];
    const hpBar = document.getElementById('boss-hp-bar');
    if (hpBar) hpBar.style.display = 'none';

    // Destroy any lingering auto turrets
    for (const side of ['left', 'right']) {
      if (this._autoTurrets[side]) {
        this._autoTurrets[side].destroy();
        this._autoTurrets[side] = null;
      }
    }

    // Reset upgrades
    this._upgradeLevels = {};
    this.shop.resetUpgrades();

    // Reset EMP
    this.emp.unlocked     = false;
    this.emp.cooldownMax  = 15;
    this.emp.stunDuration = 1.0;
    this.emp._cooldownT   = 0;

    // Reset turret stats
    this.turret.setMaxAmmo(50);
    this.turret.setFireCooldown(0.20);
    this.turret.reload();
    this._emptyGunPlayed = false;

    this._infoPanel.visible = false;
    this._panelBtnHovered   = false;
    this.shop.close();
    this.ui.hideOverlay();

    this._currentPeriod    = 'day';
    this._skyTransitioning = false;
    this._setLightBlend(0);
    this.audio.stopRain();
    this.sceneBuilder.resetToDay();
    this.sceneBuilder.setLightningCallback(() => this.audio.thunder());

    this._startMusic();
    this._startNextWave();
  }

  // ── Upgrade system ────────────────────────────────────────────
  buyAutoTurret(side) {
    if (this._autoTurrets[side]) return;
    this._autoTurrets[side] = new AutoTurret(this.scene, this.cameraRig, side);
  }

  upgradeAutoTurretRate(level) {
    const cd = 3.0 * Math.pow(1 / 1.5, level);
    for (const side of ['left', 'right']) {
      if (this._autoTurrets[side]) this._autoTurrets[side].setFireCooldown(cd);
    }
  }

  _applyUpgrade(id) {
    const upg = this.shop.getUpgrade(id);
    if (!upg) return;

    const lvlNow = this._upgradeLevels[id] ?? 0;
    if (lvlNow >= upg.maxLevel) return;

    const cost = upg.cost(lvlNow);
    if (this.money < cost) return;

    if (upg.requires?.some(r => !(this._upgradeLevels[r] ?? 0))) return;

    this.money -= cost;
    this._upgradeLevels[id] = lvlNow + 1;
    this.shop.levels[id]    = this._upgradeLevels[id];
    upg.apply(this, this._upgradeLevels[id]);
    this.shop.draw(this.money);
  }

  // ── Shop flow ─────────────────────────────────────────────────
  _openShop() {
    // No-damage bonus: $50 for wave 1, +$10 per subsequent wave
    let bonus = 0;
    if (this.playerHP >= this._hpAtWaveStart) {
      bonus = 50 + (this.wave - 1) * 10;
      this.money += bonus;
    }

    this.state = 'shop';
    this.shop.open(this._waveDisplay(this.wave), this.money, this._upgradeLevels, bonus);
  }

  // ── Wave management ───────────────────────────────────────────
  _startNextWave() {
    this.wave++;

    // After all 18 waves completed → win
    if (this.wave > MAX_WAVE) { this._win(); return; }

    const newPeriod  = this._getPeriod(this.wave);
    const needSwitch = newPeriod !== this._currentPeriod;

    if (needSwitch) {
      this.state = 'playing'; // enter playing state so _loop drives sceneBuilder.update()
      this._skyTransitioning = true;
      this._switchMusicPeriod(newPeriod);
      this.sceneBuilder.startTransition(newPeriod, 4.0, () => {
        this._currentPeriod = newPeriod;
        this._skyTransitioning = false;
        for (const d of this.drones) d.setPeriodMode(this._currentPeriod);
        if (this._currentPeriod === 'night') {
          this.sceneBuilder.setRainVisible(true);
          this.audio.startRain();
        }
        this._launchWave();
      });
    } else {
      this._launchWave();
    }
  }

  _launchWave() {
    this.state = 'playing';
    this._hpAtWaveStart = this.playerHP;

    if (this._isBossWave(this.wave)) {
      // Clear any stale wave state so isComplete() stays true (no drone spawns)
      this.waves.startBossWave(); // sets config=[] → completes instantly
      // Spawn the correct boss by wave number
      this._boss = this.wave === 12 ? new Boss2(this.scene) : new Boss(this.scene);
      this._bossMissiles = [];
      // Show desktop HP bar
      const bar = document.getElementById('boss-hp-bar');
      if (bar) { bar.style.display = 'block'; }
      const fill = document.getElementById('boss-hp-fill');
      if (fill) fill.style.width = '100%';
    } else {
      this.waves.startWave(this.wave);
    }

    this.ui.announceWave(this._waveLabel(this.wave));
    this.audio.waveStart();
  }

  // ── Win ───────────────────────────────────────────────────────
  _win() {
    this.state = 'win';
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    if (this._boss) { this._boss.destroy(); this._boss = null; }
    for (const m of this._bossMissiles) m.destroy();
    this._bossMissiles = [];
    const hpBar = document.getElementById('boss-hp-bar');
    if (hpBar) hpBar.style.display = 'none';
    if (this.input.mouseLocked) document.exitPointerLock();
    this._stopMusic();
    this._fireworkTimer = 0;
    this._drawInfoPanel('win', this.score, this.wave);
    this._infoPanel.visible = true;
  }

  _updateWin(dt) {
    // Periodic firework bursts
    this._fireworkTimer -= dt;
    if (this._fireworkTimer <= 0) {
      this._fireworkTimer = 0.3 + Math.random() * 0.7;
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        2 + Math.random() * 10,
        -4 - Math.random() * 16
      );
      this.particles.emit(pos, 'spark', 28, 16);
      this.particles.emit(pos, 'fire',  10,  9);
    }
    this.particles.update(dt);

    if (this.vrMode && this.input.consumeTriggerJustPressed()) {
      if (this._panelRayHit()) this.start();
    }
  }

  // ── Panel ray-cast + hover ────────────────────────────────────
  _panelRayHit() {
    const rc = new THREE.Raycaster();
    const q  = new THREE.Quaternion();
    for (const ctrl of [this.input.getLeftController(), this.input.getRightController()]) {
      if (!ctrl) continue;
      const pos = new THREE.Vector3();
      ctrl.getWorldPosition(pos);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(q));
      rc.set(pos, dir.normalize());
      if (rc.intersectObject(this._infoPanel).length > 0) return true;
    }
    return false;
  }

  _getPanelBtnHover() {
    if (!this.vrMode || !this._panelBtnUV) return false;
    const rc = new THREE.Raycaster();
    const q  = new THREE.Quaternion();
    for (const ctrl of [this.input.getLeftController(), this.input.getRightController()]) {
      if (!ctrl) continue;
      const pos = new THREE.Vector3();
      ctrl.getWorldPosition(pos);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(q));
      rc.set(pos, dir.normalize());
      const hits = rc.intersectObject(this._infoPanel);
      if (hits.length && hits[0].uv) {
        const { x, y } = hits[0].uv;
        const z = this._panelBtnUV;
        if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true;
      }
    }
    return false;
  }

  _gameOver() {
    this.state = 'gameover';
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    if (this._boss) { this._boss.destroy(); this._boss = null; }
    for (const m of this._bossMissiles) m.destroy();
    this._bossMissiles = [];
    const hpBar = document.getElementById('boss-hp-bar');
    if (hpBar) hpBar.style.display = 'none';
    if (this.input.mouseLocked) document.exitPointerLock();
    this._stopMusic();
    this._drawInfoPanel('gameover', this.score, this._waveDisplay(this.wave));
    this._infoPanel.visible = true;
  }

  // ── Main loop ─────────────────────────────────────────────────
  _loop(timestamp, frame) {
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    this.input.update(dt, frame, this.vrMode);

    // VR: Y button toggles the cheat panel
    if (this.vrMode && this._cheatVRMesh) {
      if (this.input.consumeY()) {
        const vis = !this._cheatVRMesh.visible;
        this._cheatVRMesh.visible = vis;
        if (vis) this._positionCheatVRPanel();
      }
      if (this._cheatVRMesh.visible) this._updateCheatVRPanel();
    }

    if (this.state === 'menu' || this.state === 'gameover') {
      if (this.vrMode) {
        const h = this._getPanelBtnHover();
        if (h !== this._panelBtnHovered) {
          this._panelBtnHovered = h;
          this._drawInfoPanel(
            this.state === 'menu' ? 'menu' : 'gameover',
            this.score, this._waveDisplay(this.wave)
          );
        }
        if (this.input.consumeTriggerJustPressed()) {
          if (this._panelRayHit()) this.start();
        }
      }

    } else if (this.state === 'win') {
      if (this.vrMode) {
        const h = this._getPanelBtnHover();
        if (h !== this._panelBtnHovered) {
          this._panelBtnHovered = h;
          this._drawInfoPanel('win', this.score, this._waveDisplay(this.wave));
        }
      }
      this._updateWin(dt);

    } else if (this.state === 'shop') {
      this._updateMusic(dt);
      this._updateShop(dt);

    } else if (this.state === 'playing') {
      this._updateMusic(dt);
      this.sceneBuilder.update(dt); // always update (rain + sky transition)
      if (this._skyTransitioning) {
        this._setLightBlend(this.sceneBuilder.currentBlend * 1.5);
      } else {
        this._update(dt, frame);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ── Shop update ───────────────────────────────────────────────
  _updateShop(dt) {
    const vrAction = this.shop.update(dt, this.input, this.vrMode, this.money);

    const key = this.input.consumeShopKey();
    let action = vrAction;

    if (!action && key) {
      if (key === '0' || key === ' ') {
        action = 'continue';
      } else {
        action = this.shop.keyToId(key);
      }
    }

    if (action === 'continue') {
      this.shop.close();
      this._startNextWave();
    } else if (action) {
      this._applyUpgrade(action);
    }

    this._updateUI();
  }

  // ── Game update (playing state) ───────────────────────────────
  _update(dt, frame) {
    // Drive turret / drone glow from blend every frame (covers evening + night)
    this._setLightBlend(this.sceneBuilder.currentBlend * 1.5);

    // ── EMP ───────────────────────────────────────────────────
    this.emp.update(dt);
    if (this.input.consumeEMP()) {
      if (this.emp.activate(this.drones)) {
        this.audio.baseHit?.();
      }
    }

    // ── Turret aim + barrel spin ──────────────────────────────
    const isFiring = this.input.isTriggerHeld();
    this.turret.update(dt, this.vrMode, this.input, isFiring);
    this.ui.setAimOnTarget(this.turret.isAimingAtDrone([
      ...this.drones,
      ...(this._boss && !this._boss.dead ? [this._boss] : []),
      ...this._bossMissiles,
      ...(this._boss?.shields?.filter(s => !s.dead) ?? []),
    ]));

    // ── Full-auto shooting ────────────────────────────────────
    if (isFiring) {
      if (this.turret.getAmmo() === 0) {
        if (!this._emptyGunPlayed) {
          this.audio.emptyGun();
          this._emptyGunPlayed = true;
        }
      } else {
        const shot = this.turret.fire(this.vrMode, this.audio);
        if (shot) this.projectiles.firePlayer(shot.muzzlePos, shot.aimDir);
      }
    } else {
      this._emptyGunPlayed = false;
    }

    // ── Reload ────────────────────────────────────────────────
    if (this.input.consumeReload()) {
      this.turret.reload();
      this.audio.gunReload();
    }

    // ── Auto turrets ──────────────────────────────────────────
    for (const side of ['left', 'right']) {
      this._autoTurrets[side]?.update(dt, this.drones, this.projectiles);
    }

    // ── Wave spawning ─────────────────────────────────────────
    const newDrones = this.waves.update(dt);
    for (const d of newDrones) {
      d.setPeriodMode(this._currentPeriod);
    }
    this.drones.push(...newDrones);

    // ── Player world position ─────────────────────────────────
    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);

    // ── Boss update ───────────────────────────────────────────
    if (this._boss && !this._boss.dead) {
      const newMissiles = this._boss.update(dt, playerPos, this.scene, this.camera);
      this._bossMissiles.push(...newMissiles);
    }

    // ── Boss missile update ───────────────────────────────────
    for (let i = this._bossMissiles.length - 1; i >= 0; i--) {
      const m = this._bossMissiles[i];
      if (m.dead) { m.destroy(); this._bossMissiles.splice(i, 1); continue; }
      const { dist } = m.update(dt, playerPos, this.camera);
      if (dist < 1.0) {
        this.playerHP = Math.max(0, this.playerHP - m.damage);
        this.particles.emit(playerPos.clone(), 'fire', 10, 7);
        this.audio.baseHit();
        this._shakeCamera();
        m.dead = true; m.destroy();
        this._bossMissiles.splice(i, 1);
        if (this.playerHP <= 0) { this._gameOver(); return; }
      }
    }

    // ── Drone update ──────────────────────────────────────────
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];
      if (drone.dead) { this.drones.splice(i, 1); continue; }

      const { dist } = drone.update(dt, playerPos, this.camera);

      if (dist < 1.2) {
        this.playerHP -= drone.spec.damage;
        this.particles.emit(playerPos.clone(), 'fire', 12, 8);
        this.audio.baseHit();
        drone.destroy();
        this.drones.splice(i, 1);
        this._shakeCamera();
        if (this.playerHP <= 0) {
          this.playerHP = 0;
          this._gameOver();
          return;
        }
      }
    }

    // ── Projectile update (drones + boss + missiles) ──────────
    const extras = [
      ...(this._boss && !this._boss.dead ? [this._boss] : []),
      ...this._bossMissiles,
      ...(this._boss?.shields?.filter(s => !s.dead) ?? []),
    ];
    const { hitDrones, hitExtras, playerDamage } =
      this.projectiles.update(dt, this.drones, playerPos, extras);

    for (const drone of hitDrones) {
      const killed = drone.hit(1);
      this.audio.hit();
      if (killed) {
        this.score += drone.spec.points;
        this.money += KILL_MONEY[drone.spec.name] ?? 10;
        this.particles.emit(drone.group.position.clone(), 'fire', 14, 8);
        this.particles.emit(drone.group.position.clone(), 'spark', 6, 10);
        this.audio.explosion(drone.spec.size);
        drone.destroy();
      }
    }

    for (const target of hitExtras) {
      this.audio.hit();
      if (target.kind === 'boss') {
        if (this._boss.hit(1)) { this._bossKilled(); return; }
      } else if (target.kind === 'shield') {
        if (target.hit(1)) {
          this.score += 50;
          this.particles.emit(target.group.position.clone(), 'spark', 4, 6);
          this.audio.explosion(0.3);
        }
      } else if (target.kind === 'missile') {
        if (target.hit(1)) {
          this.score += 100;
          this.money  += 5;
          this.particles.emit(target.group.position.clone(), 'fire', 6, 5);
          this.particles.emit(target.group.position.clone(), 'spark', 4, 6);
          this.audio.explosion(0.4);
          target.destroy();
          this._bossMissiles = this._bossMissiles.filter(m => m !== target);
        }
      }
    }

    if (playerDamage > 0) {
      this.playerHP = Math.max(0, this.playerHP - playerDamage);
      this.audio.baseHit();
      this._shakeCamera();
      if (this.playerHP <= 0) { this._gameOver(); return; }
    }

    // ── Particles ─────────────────────────────────────────────
    this.particles.update(dt);

    // ── Wave complete check ───────────────────────────────────
    if (this._isBossWave(this.wave)) {
      // Boss wave: completion handled in _bossKilled() above
    } else if (this.waves.isComplete() && this.drones.length === 0) {
      this.waves.scheduleNext(() => this._openShop(), 3);
    }

    this._updateUI();
  }

  _updateUI() {
    this.ui.update({
      score:       this.score,
      wave:        this._waveDisplay(this.wave),
      drones:      this.drones.length,
      baseHP:      this.playerHP,
      ammo:        this.turret.getAmmo(),
      maxAmmo:     this.turret.getMaxAmmo(),
      money:       this.money,
      empFraction: this.emp.readyFraction,
      empUnlocked: this.emp.unlocked,
      empCooldown: this.emp.cooldownRemaining,
      fireRate:    this.turret.getFireRate(),
    });

    // Desktop boss HP bar
    const bar  = document.getElementById('boss-hp-bar');
    const fill = document.getElementById('boss-hp-fill');
    if (bar && fill) {
      if (this._boss && !this._boss.dead) {
        bar.style.display = 'block';
        fill.style.width  = `${(this._boss.hp / this._boss.maxHp) * 100}%`;
      } else if (bar.style.display !== 'none' && !this._boss) {
        bar.style.display = 'none';
      }
    }
  }

  _shakeCamera() {
    const orig = this.cameraRig.position.clone();
    this.cameraRig.position.x += (Math.random() - 0.5) * 0.10;
    this.cameraRig.position.z += (Math.random() - 0.5) * 0.05;
    setTimeout(() => this.cameraRig.position.copy(orig), 160);
  }

  // Sets main turret light + all auto turret lights to the same intensity.
  _setLightBlend(v) {
    this._turretLight.intensity = v;
    for (const at of Object.values(this._autoTurrets)) at?.setLightIntensity(v);
  }

  // ── Boss HP bar (desktop HUD) ─────────────────────────────────
  _buildBossHPBar() {
    const bar = document.createElement('div');
    bar.id = 'boss-hp-bar';
    bar.style.cssText = `
      display:none; position:fixed; top:18px; left:50%;
      transform:translateX(-50%); width:380px;
      pointer-events:none; z-index:50;
    `;
    bar.innerHTML = `
      <div style="color:#ff99ff;font:bold 13px monospace;text-align:center;
                  margin-bottom:4px;text-shadow:0 0 10px #ff00ff;letter-spacing:2px;">
        ◈ BOSS ◈
      </div>
      <div style="background:#1a0028;border:1px solid #cc44ff;border-radius:3px;
                  height:14px;overflow:hidden;">
        <div id="boss-hp-fill" style="background:linear-gradient(90deg,#ff44ff,#9900ee);
          height:100%;width:100%;transition:width 0.08s;"></div>
      </div>
    `;
    document.body.appendChild(bar);
  }

  _bossKilled() {
    const pos = this._boss.group.position.clone();
    this.score += this._boss.points;
    this.money += 200;

    // Big death explosion
    this.audio.explosion(3.0);
    this.particles.emit(pos, 'fire',  40, 18);
    this.particles.emit(pos, 'spark', 25, 16);

    this._boss.destroy();
    this._boss = null;

    // Destroy all remaining missiles
    for (const m of this._bossMissiles) { if (!m.dead) m.destroy(); }
    this._bossMissiles = [];

    // Hide desktop HP bar
    const bar = document.getElementById('boss-hp-bar');
    if (bar) bar.style.display = 'none';

    if (this.wave === MAX_WAVE) {
      this._win();
    } else {
      this.waves.scheduleNext(() => this._openShop(), 3);
    }
  }

  // ── Cheat menu ────────────────────────────────────────────────
  _buildCheatMenu() {
    // Wave label → internal wave number mapping
    const sections = [
      { label: 'DAY',     color: '#87ceeb', waves: [['W1',1],['W2',2],['W3',3],['W4',4],['W5',5],['BOSS 1',6]] },
      { label: 'EVENING', color: '#f07030', waves: [['W6',7],['W7',8],['W8',9],['W9',10],['W10',11],['BOSS 2',12]] },
      { label: 'NIGHT',   color: '#44aaff', waves: [['W11',13],['W12',14],['W13',15],['W14',16],['W15',17],['BOSS 3',18]] },
    ];

    const panel = document.createElement('div');
    panel.style.cssText = `
      display:none; position:fixed; top:50%; left:50%;
      transform:translate(-50%,-50%);
      background:rgba(0,5,15,0.97);
      border:2px solid #00aaff; border-radius:14px;
      padding:22px 26px; color:#fff; font-family:monospace;
      z-index:200; min-width:560px;
      box-shadow:0 0 50px rgba(0,160,255,0.4);
    `;

    let rows = `
      <div style="text-align:center;color:#00ddff;font-size:19px;font-weight:bold;
                  letter-spacing:2px;margin-bottom:6px;">⚠ CHEAT MENU ⚠</div>
      <div style="text-align:center;color:#334466;font-size:11px;margin-bottom:16px;">
        Backtick (\`) to open/close &nbsp;|&nbsp; Wave buttons start a fresh game at that wave
      </div>
    `;

    for (const { label, color, waves } of sections) {
      rows += `<div style="display:flex;align-items:center;gap:7px;margin-bottom:9px;">
        <span style="color:${color};width:62px;font-size:11px;text-align:right;flex-shrink:0;">${label}</span>`;
      for (const [wLabel, wNum] of waves) {
        const boss = wLabel.startsWith('BOSS');
        rows += `<button data-wave="${wNum}" style="
          background:${boss ? '#2a1800' : '#001020'};
          border:1px solid ${boss ? '#cc8800' : '#005588'};
          color:${boss ? '#ffaa00' : '#88ccff'};
          font-family:monospace;font-size:11px;padding:5px 9px;
          border-radius:5px;cursor:pointer;white-space:nowrap;">${wLabel}</button>`;
      }
      rows += `</div>`;
    }

    rows += `
      <div style="margin-top:14px;border-top:1px solid #0a1a2a;padding-top:13px;
                  display:flex;gap:9px;flex-wrap:wrap;">
        <button id="cheat-all" style="flex:2;background:#002510;border:1px solid #00aa55;
          color:#00ff88;font-family:monospace;font-size:12px;
          padding:9px 12px;border-radius:6px;cursor:pointer;">
          ★ All Upgrades + $9999
        </button>
        <button id="cheat-money" style="flex:1;background:#1a1000;border:1px solid #aa8800;
          color:#ffd700;font-family:monospace;font-size:12px;
          padding:9px 12px;border-radius:6px;cursor:pointer;">
          +$9999
        </button>
        <button id="cheat-hp" style="flex:1;background:#1a0010;border:1px solid #aa0044;
          color:#ff6688;font-family:monospace;font-size:12px;
          padding:9px 12px;border-radius:6px;cursor:pointer;">
          Full HP
        </button>
        <button id="cheat-close" style="background:#100008;border:1px solid #440022;
          color:#ff4466;font-family:monospace;font-size:12px;
          padding:9px 12px;border-radius:6px;cursor:pointer;">✕</button>
      </div>
    `;

    panel.innerHTML = rows;
    document.body.appendChild(panel);
    this._cheatPanel = panel;

    // Wave buttons
    panel.querySelectorAll('[data-wave]').forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.filter = 'brightness(1.5)');
      btn.addEventListener('mouseleave', () => btn.style.filter = '');
      btn.addEventListener('click', () => {
        this._cheatPanel.style.display = 'none';
        this._cheatStartWave(parseInt(btn.dataset.wave));
      });
    });

    document.getElementById('cheat-all').addEventListener('click', () => {
      if (this.state === 'menu') this._cheatStartWave(1);
      this._cheatAllUpgrades();
    });
    document.getElementById('cheat-money').addEventListener('click', () => {
      if (this.state === 'menu') this._cheatStartWave(1);
      this.money += 9999;
    });
    document.getElementById('cheat-hp').addEventListener('click', () => {
      this.playerHP = 100;
    });
    document.getElementById('cheat-close').addEventListener('click', () => {
      this._cheatPanel.style.display = 'none';
    });

    // Backtick toggles the panel
    document.addEventListener('keydown', e => {
      if (e.code === 'Backquote') {
        e.preventDefault();
        const vis = this._cheatPanel.style.display !== 'none';
        this._cheatPanel.style.display = vis ? 'none' : 'block';
      }
    });

    this._buildCheatVRPanel();
  }

  _cheatStartWave(targetWave) {
    if (!this.audio.initialized) this.audio.init();

    // Full reset (mirrors start())
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    if (this._boss) { this._boss.destroy(); this._boss = null; }
    for (const m of this._bossMissiles) m.destroy();
    this._bossMissiles = [];
    const hpBar = document.getElementById('boss-hp-bar');
    if (hpBar) hpBar.style.display = 'none';
    for (const side of ['left', 'right']) {
      if (this._autoTurrets[side]) { this._autoTurrets[side].destroy(); this._autoTurrets[side] = null; }
    }

    this.state    = 'playing';
    this.score    = 0;
    this.wave     = targetWave - 1; // _startNextWave will increment to targetWave
    this.playerHP = 100;
    this.money    = 500;

    this._upgradeLevels = {};
    this.shop.resetUpgrades();
    this.emp.unlocked = false; this.emp.cooldownMax = 15;
    this.emp.stunDuration = 1.0; this.emp._cooldownT = 0;
    this.turret.setMaxAmmo(50); this.turret.setFireCooldown(0.20);
    this.turret.reload(); this._emptyGunPlayed = false;

    this._infoPanel.visible = false;
    this._panelBtnHovered   = false;
    this.shop.close();
    this.ui.hideOverlay();

    // Snap sky/music directly to the target period — no transition
    const period = this._getPeriod(targetWave);
    this._currentPeriod    = period;
    this._skyTransitioning = false;
    this.audio.stopRain();
    this.sceneBuilder.snapToPeriod(period);
    this.sceneBuilder.setLightningCallback(() => this.audio.thunder());
    this._setLightBlend(this.sceneBuilder.currentBlend * 1.5);
    if (period === 'night') this.audio.startRain();

    // Music for this period
    this._stopAllMusic();
    this._musicPeriod = period;
    this._startMusic();

    this._startNextWave(); // wave becomes targetWave; period matches so no sky transition fires
  }

  // ── VR cheat panel (3-D canvas mesh, raycasted like the shop) ─
  _buildCheatVRPanel() {
    const CW = 900, CH = 600;
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    this._cheatVRCtx = canvas.getContext('2d');
    this._cheatVRTex = new THREE.CanvasTexture(canvas);

    this._cheatVRMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 2.0),
      new THREE.MeshBasicMaterial({
        map: this._cheatVRTex, transparent: true,
        side: THREE.DoubleSide, depthTest: false,
      })
    );
    this._cheatVRMesh.visible = false;
    this.scene.add(this._cheatVRMesh);

    this._cheatVRBtnZones = [];
    this._cheatVRHover    = null;
    this._cheatGripTimer  = 0;

    this._drawCheatVRPanel();
  }

  _drawCheatVRPanel(hover = null) {
    const ctx = this._cheatVRCtx;
    const CW = 900, CH = 600;
    ctx.clearRect(0, 0, CW, CH);

    // Background + border
    ctx.fillStyle = 'rgba(0,5,15,0.97)';
    ctx.beginPath(); ctx.roundRect(4, 4, CW-8, CH-8, 16); ctx.fill();
    ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(4, 4, CW-8, CH-8, 16); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ddff'; ctx.font = 'bold 26px monospace';
    ctx.fillText('⚠  CHEAT MENU  ⚠', CW/2, 36);
    ctx.fillStyle = '#334466'; ctx.font = '12px monospace';
    ctx.fillText('Press Y (left controller) to open / close', CW/2, 60);

    this._cheatVRBtnZones = [];

    const sections = [
      { label:'DAY',     color:'#87ceeb', y: 88, waves:[['W1',1],['W2',2],['W3',3],['W4',4],['W5',5],['BOSS 1',6]] },
      { label:'EVENING', color:'#f07030', y:168, waves:[['W6',7],['W7',8],['W8',9],['W9',10],['W10',11],['BOSS 2',12]] },
      { label:'NIGHT',   color:'#44aaff', y:248, waves:[['W11',13],['W12',14],['W13',15],['W14',16],['W15',17],['BOSS 3',18]] },
    ];

    const LX=18, LW=78, BTN_W=118, BTN_H=58, GAP=6;
    const BTN_START = LX + LW + 8;

    for (const { label, color, y, waves } of sections) {
      ctx.fillStyle = color; ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(label, LX + LW, y + BTN_H/2);

      waves.forEach(([wLabel, wNum], i) => {
        const boss = wLabel.startsWith('BOSS');
        const bx   = BTN_START + i * (BTN_W + GAP);
        const hov  = hover === `w${wNum}`;
        ctx.fillStyle   = hov ? (boss ? '#5a3000' : '#003060') : (boss ? '#2a1800' : '#001525');
        ctx.strokeStyle = boss ? '#cc8800' : '#005588';
        ctx.lineWidth   = 1.5;
        ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
        ctx.beginPath(); ctx.roundRect(bx, y, BTN_W, BTN_H, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = boss ? '#ffaa00' : '#88ccff';
        ctx.font      = `${boss ? 'bold ' : ''}14px monospace`;
        ctx.fillText(wLabel, bx + BTN_W/2, y + BTN_H/2);
        this._cheatVRBtnZones.push({ id:`w${wNum}`, wNum, x:bx, y, w:BTN_W, h:BTN_H });
      });
    }

    // Utility row
    const UY=340, UH=58, MARGIN=10;
    const utils = [
      { id:'all',   label:'★ All Upgrades + $9999', tc:'#00ff88', bc:'#00aa55', bw:330 },
      { id:'money', label:'+$9999',                 tc:'#ffd700', bc:'#aa8800', bw:148 },
      { id:'hp',    label:'Full HP',                tc:'#ff6688', bc:'#aa0044', bw:148 },
      { id:'close', label:'✕ Close',                tc:'#ff4466', bc:'#440022', bw:120 },
    ];
    let ux = MARGIN;
    for (const u of utils) {
      const hov = hover === u.id;
      ctx.fillStyle   = hov ? '#ffffff22' : '#00000088';
      ctx.strokeStyle = u.bc; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(ux, UY, u.bw, UH, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle   = u.tc; ctx.font = 'bold 13px monospace';
      ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.label, ux + u.bw/2, UY + UH/2);
      this._cheatVRBtnZones.push({ id:u.id, x:ux, y:UY, w:u.bw, h:UH });
      ux += u.bw + GAP;
    }

    // Hint at bottom
    ctx.fillStyle = '#223344'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('Aim controller ray at a button  ·  Trigger to select', CW/2, 430);

    this._cheatVRTex.needsUpdate = true;
  }

  _positionCheatVRPanel() {
    const camPos = new THREE.Vector3();
    const camDir = new THREE.Vector3(0, 0, -1);
    this.camera.getWorldPosition(camPos);
    camDir.applyQuaternion(this.camera.quaternion);
    camDir.y = 0; camDir.normalize();
    this._cheatVRMesh.position.copy(camPos).addScaledVector(camDir, 2.5);
    this._cheatVRMesh.position.y = camPos.y + 0.1;
    this._cheatVRMesh.lookAt(camPos);
  }

  _updateCheatVRPanel() {
    const rc = new THREE.Raycaster();
    const q  = new THREE.Quaternion();
    let newHover = null;
    const trigger = this.input.consumeTriggerJustPressed();

    for (const ctrl of [this.input.getRightController(), this.input.getLeftController()]) {
      if (!ctrl || newHover !== null) continue;
      const pos = new THREE.Vector3();
      ctrl.getWorldPosition(pos);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(q));
      rc.set(pos, dir.normalize());
      const hits = rc.intersectObject(this._cheatVRMesh);
      if (!hits.length || !hits[0].uv) continue;
      const cx = hits[0].uv.x * 900;
      const cy = (1 - hits[0].uv.y) * 600;
      for (const zone of this._cheatVRBtnZones) {
        if (cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h) {
          newHover = zone.id;
          if (trigger) this._cheatVRAction(zone);
          break;
        }
      }
    }

    if (newHover !== this._cheatVRHover) {
      this._cheatVRHover = newHover;
      this._drawCheatVRPanel(newHover);
    }
  }

  _cheatVRAction(zone) {
    if (zone.wNum !== undefined) {
      this._cheatVRMesh.visible = false;
      this._cheatStartWave(zone.wNum);
    } else if (zone.id === 'all') {
      if (this.state === 'menu') this._cheatStartWave(1);
      this._cheatAllUpgrades();
    } else if (zone.id === 'money') {
      if (this.state === 'menu') this._cheatStartWave(1);
      this.money += 9999;
    } else if (zone.id === 'hp') {
      this.playerHP = 100;
    } else if (zone.id === 'close') {
      this._cheatVRMesh.visible = false;
    }
  }

  _cheatAllUpgrades() {
    this.money = Math.max(this.money, 9999);
    const ids = ['ammo_cap','fire_rate','turret_l','turret_r','turret_rate','buy_emp','emp_cd','emp_stun'];
    for (const id of ids) {
      const upg = this.shop.getUpgrade(id);
      if (!upg) continue;
      this._upgradeLevels[id] = upg.maxLevel;
      this.shop.levels[id]    = upg.maxLevel;
      upg.apply(this, upg.maxLevel);
    }
  }
}
