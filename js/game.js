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
import { AbilitySystem }     from './abilities.js';

export class Game {
  constructor() {
    this.state    = 'menu';
    this.score    = 0;
    this.wave     = 0;
    this.playerHP = 100;
    this.drones   = [];
    this.vrMode   = false;

    this.abilities = {
      scan:   { cd: 30, timer: 0 },
      emp:    { cd: 45, timer: 0 },
      turret: { cd: 60, timer: 0 },
    };

    this._lastTime = 0;

    this._initRenderer();
    this._initScene();
    this._initSystems();

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
    this.renderer.toneMappingExposure = 1.2;
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
    // Desktop eye height relative to rig. In VR the headset overrides this.
    this.camera.position.set(0, 1.6, 0);

    // Rig at world origin so player stands in the bunker centre.
    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    new SceneBuilder(this.scene).build();
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

    this.input = new InputManager(
      this.renderer, this.cameraRig, this.camera, this.scene
    );

    // WaveManager no longer needs baseCorePos
    this.waves = new WaveManager(this.scene);

    this.abilitySystem = new AbilitySystem(
      this.scene, this.audio, this.particles
    );
  }

  // ── Start / restart ───────────────────────────────────────────
  start() {
    if (!this.audio.initialized) this.audio.init();

    this.state    = 'playing';
    this.score    = 0;
    this.playerHP = 100;
    this.wave     = 0;

    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    this.abilitySystem.resetCooldowns(this.abilities);

    this.ui.hideOverlay();
    this._startNextWave();
  }

  // ── Abilities (HTML onclick + VR buttons) ─────────────────────
  useAbility(name) {
    if (this.state !== 'playing') return;
    if (this.abilities[name].timer > 0) return;
    if (!this.audio.initialized) this.audio.init();

    this.audio.abilityActivate();
    this.abilities[name].timer = this.abilities[name].cd;

    // Pass player world position so turret spawns nearby
    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);

    this.abilitySystem.activate(name, this.drones, playerPos);
  }

  // ── Wave management ───────────────────────────────────────────
  _startNextWave() {
    this.wave++;
    this.waves.startWave(this.wave);
    this.ui.announceWave(this.wave);
    this.audio.waveStart();
  }

  _gameOver() {
    this.state = 'gameover';
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.projectiles.clear();
    if (this.input.mouseLocked) document.exitPointerLock();
    this.ui.showOverlay('GAME OVER',
      `Wave ${this.wave}  ·  Score: ${this.score}`, 'PLAY AGAIN');
  }

  // ── Main loop ─────────────────────────────────────────────────
  _loop(timestamp, frame) {
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    if (this.state === 'playing') this._update(dt, frame);

    this.renderer.render(this.scene, this.camera);
  }

  _update(dt, frame) {
    // ── Input ────────────────────────────────────────────────
    this.input.update(dt, frame, this.vrMode);

    // ── Turret aim ────────────────────────────────────────────
    this.turret.update(dt, this.vrMode, this.input);
    this.ui.setAimOnTarget(this.turret.isAimingAtDrone(this.drones));

    // ── Player shooting ──────────────────────────────────────
    if (this.input.consumeShot()) {
      const shot = this.turret.fire(this.vrMode, this.audio);
      if (shot) {
        this.projectiles.firePlayer(shot.muzzlePos, shot.aimDir);
      }
    }

    // ── Ability key press ────────────────────────────────────
    const abilityKey = this.input.consumeAbility();
    if (abilityKey) this.useAbility(abilityKey);

    // ── Cooldowns ────────────────────────────────────────────
    for (const ab of Object.values(this.abilities)) {
      if (ab.timer > 0) ab.timer = Math.max(0, ab.timer - dt);
    }

    // ── Wave spawning ────────────────────────────────────────
    const newDrones = this.waves.update(dt);
    this.drones.push(...newDrones);

    // ── Player world position (used for drone targeting + hit) ─
    const playerPos = new THREE.Vector3();
    this.camera.getWorldPosition(playerPos);

    // ── Drone movement & shooting ────────────────────────────
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];
      if (drone.dead) { this.drones.splice(i, 1); continue; }

      const { dist, shot } = drone.update(dt, playerPos, this.camera);

      // Drone fires a projectile
      if (shot) this.projectiles.fireEnemy(shot.from, shot.dir);

      // Drone reached the player (melee damage)
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

    // ── Projectile movement & collision ──────────────────────
    const { hitDrones, playerDamage } =
      this.projectiles.update(dt, this.drones, playerPos);

    // Handle drones hit by player bullets
    for (const drone of hitDrones) {
      const killed = drone.hit(1);
      this.audio.hit();
      if (killed) {
        this.score += drone.spec.points;
        this.particles.emit(drone.group.position.clone(), 'fire', 14, 8);
        this.particles.emit(drone.group.position.clone(), 'spark', 6, 10);
        this.audio.explosion(drone.spec.size);
        drone.destroy();
      }
    }

    // Handle player hit by enemy bullets
    if (playerDamage > 0) {
      this.playerHP = Math.max(0, this.playerHP - playerDamage);
      this.audio.baseHit();
      this._shakeCamera();
      if (this.playerHP <= 0) { this._gameOver(); return; }
    }

    // ── Ability system (defence turrets, EMP rings) ───────────
    this.abilitySystem.update(dt, this.drones);
    // Collect kill bonus from defence turrets
    this.score += this.abilitySystem.consumeKillBonus();

    // ── Particles ─────────────────────────────────────────────
    this.particles.update(dt);

    // ── Check wave complete ───────────────────────────────────
    if (this.waves.isComplete() && this.drones.length === 0) {
      this.waves.scheduleNext(() => this._startNextWave(), 4);
    }

    // ── UI ────────────────────────────────────────────────────
    this.ui.update({
      score:     this.score,
      wave:      this.wave,
      drones:    this.drones.length,
      baseHP:    this.playerHP,  // ui reuses the same HP bar
      abilities: this.abilities,
    });
  }

  _shakeCamera() {
    const orig = this.cameraRig.position.clone();
    this.cameraRig.position.x += (Math.random() - 0.5) * 0.10;
    this.cameraRig.position.z += (Math.random() - 0.5) * 0.05;
    setTimeout(() => this.cameraRig.position.copy(orig), 160);
  }
}
