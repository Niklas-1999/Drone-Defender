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

// Money awarded per drone kill by type
const KILL_MONEY = { scout: 10, warrior: 20, titan: 30 };

export class Game {
  constructor() {
    this.state    = 'menu';
    this.score    = 0;
    this.wave     = 0;
    this.playerHP = 100;
    this.money    = 0;
    this.drones   = [];
    this.vrMode   = false;

    this._lastTime       = 0;
    this._isNight        = false;
    this._skyTransitioning = false;
    this._emptyGunPlayed = false;

    // Upgrade levels (keyed by upgrade id) — persisted through waves, reset on new game
    this._upgradeLevels = {};

    // Auto turrets — null until purchased
    this._autoTurrets = { left: null, right: null };

    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._initMusic();
    this._buildInfoPanel();

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
    this._tracks = [
      new Audio('assets/Music/Neon Alley Raid.mp3'),
      new Audio('assets/Music/Neon Alley Raid 2.mp3'),
    ];
    this._currentTrack = 0;
    this._tracks.forEach((t, i) => {
      t.volume = 0.55;
      t.addEventListener('ended', () => {
        this._currentTrack = 1 - i;
        if (this.state === 'playing') this._tracks[this._currentTrack].play().catch(() => {});
      });
    });
  }

  _startMusic() {
    this._tracks.forEach(t => { t.pause(); t.currentTime = 0; });
    this._currentTrack = Math.random() < 0.5 ? 0 : 1;
    this._tracks[this._currentTrack].play().catch(() => {});
  }

  _stopMusic() {
    this._tracks.forEach(t => { t.pause(); t.currentTime = 0; });
  }

  // ── 3-D info panel (start / game-over) ───────────────────────
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

      this._drawPanelBtn(ctx, W / 2, 220, 200, 52, '▶  START', '#00ffee', '#002a30');

      ctx.fillStyle = '#666688';
      ctx.font = '18px monospace';
      ctx.fillText('VR: aim controller at this panel + trigger', W / 2, 300);
      ctx.fillText('Desktop: Press SPACE', W / 2, 324);

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

      this._drawPanelBtn(ctx, W / 2, 272, 240, 52, '↺  TRY AGAIN', '#ffcc44', '#2a1a00');

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
    this.shop.close();
    this.ui.hideOverlay();

    this._isNight = false;
    this._skyTransitioning = false;
    this._turretLight.intensity = 0;
    this.sceneBuilder.resetToDay();

    this._startMusic();
    this._startNextWave();
  }

  // ── Upgrade system ────────────────────────────────────────────

  buyAutoTurret(side) {
    if (this._autoTurrets[side]) return;
    this._autoTurrets[side] = new AutoTurret(this.scene, this.cameraRig, side);
  }

  upgradeAutoTurretRate(level) {
    // Base 3s cooldown, each level multiplies by 1/1.5
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

    // Check requirements
    if (upg.requires?.some(r => !(this._upgradeLevels[r] ?? 0))) return;

    this.money -= cost;
    this._upgradeLevels[id] = lvlNow + 1;
    this.shop.levels[id]    = this._upgradeLevels[id];
    upg.apply(this, this._upgradeLevels[id]);
    this.shop.draw(this.money);
  }

  // ── Shop flow ─────────────────────────────────────────────────
  _openShop() {
    this.state = 'shop';
    this.shop.open(this.wave, this.money, this._upgradeLevels);
  }

  // ── Wave management ───────────────────────────────────────────
  _isNightWave(w) { return Math.floor((w - 1) / 5) % 2 === 1; }

  _startNextWave() {
    this.wave++;
    const wantNight  = this._isNightWave(this.wave);
    const needsSwitch = wantNight !== this._isNight;

    if (needsSwitch) {
      this._skyTransitioning = true;
      this.sceneBuilder.startTransition(wantNight, 4.0, () => {
        this._isNight = wantNight;
        this._skyTransitioning = false;
        for (const d of this.drones) d.setNightMode(this._isNight);
        this._turretLight.intensity = this._isNight ? 3 : 0;
        this._launchWave();
      });
    } else {
      this._launchWave();
    }
  }

  _launchWave() {
    this.state = 'playing';
    this.waves.startWave(this.wave);
    this.ui.announceWave(this.wave);
    this.audio.waveStart();
  }

  // ── Panel ray-cast ────────────────────────────────────────────
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

  _gameOver() {
    this.state = 'gameover';
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    if (this.input.mouseLocked) document.exitPointerLock();
    this._stopMusic();
    this._drawInfoPanel('gameover', this.score, this.wave);
    this._infoPanel.visible = true;
  }

  // ── Main loop ─────────────────────────────────────────────────
  _loop(timestamp, frame) {
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    this.input.update(dt, frame, this.vrMode);

    if (this.state === 'menu' || this.state === 'gameover') {
      if (this.vrMode && this.input.consumeTriggerJustPressed()) {
        if (this._panelRayHit()) this.start();
      }

    } else if (this.state === 'shop') {
      this._updateShop(dt);

    } else if (this.state === 'playing') {
      if (this._skyTransitioning) {
        this.sceneBuilder.update(dt);
        this._turretLight.intensity = this.sceneBuilder.currentBlend * 3;
      } else {
        this._update(dt, frame);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ── Shop update ───────────────────────────────────────────────
  _updateShop(dt) {
    // VR interaction — returns button id or null
    const vrAction = this.shop.update(dt, this.input, this.vrMode, this.money);

    // Keyboard interaction
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

    // Always update UI so money changes are visible
    this._updateUI();
  }

  // ── Game update (playing state) ───────────────────────────────
  _update(dt, frame) {
    // ── EMP ───────────────────────────────────────────────────
    this.emp.update(dt);
    if (this.input.consumeEMP()) {
      if (this.emp.activate(this.drones)) {
        this.audio.baseHit?.(); // reuse impact sound as EMP pulse; ok if missing
      }
    }

    // ── Turret aim + barrel spin ──────────────────────────────
    const isFiring = this.input.isTriggerHeld();
    this.turret.update(dt, this.vrMode, this.input, isFiring);
    this.ui.setAimOnTarget(this.turret.isAimingAtDrone(this.drones));

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
      if (this._isNight) d.setNightMode(true);
    }
    this.drones.push(...newDrones);

    // ── Player world position ─────────────────────────────────
    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);

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

    // ── Projectile update ─────────────────────────────────────
    const { hitDrones, playerDamage } =
      this.projectiles.update(dt, this.drones, playerPos);

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

    if (playerDamage > 0) {
      this.playerHP = Math.max(0, this.playerHP - playerDamage);
      this.audio.baseHit();
      this._shakeCamera();
      if (this.playerHP <= 0) { this._gameOver(); return; }
    }

    // ── Particles ─────────────────────────────────────────────
    this.particles.update(dt);

    // ── Wave complete → open shop ─────────────────────────────
    if (this.waves.isComplete() && this.drones.length === 0) {
      this.waves.scheduleNext(() => this._openShop(), 3);
    }

    this._updateUI();
  }

  _updateUI() {
    this.ui.update({
      score:       this.score,
      wave:        this.wave,
      drones:      this.drones.length,
      baseHP:      this.playerHP,
      ammo:        this.turret.getAmmo(),
      maxAmmo:     this.turret.getMaxAmmo(),
      money:       this.money,
      empFraction: this.emp.readyFraction,
      empUnlocked: this.emp.unlocked,
      fireRate:    this.turret.getFireRate(),
    });
  }

  _shakeCamera() {
    const orig = this.cameraRig.position.clone();
    this.cameraRig.position.x += (Math.random() - 0.5) * 0.10;
    this.cameraRig.position.z += (Math.random() - 0.5) * 0.05;
    setTimeout(() => this.cameraRig.position.copy(orig), 160);
  }
}
