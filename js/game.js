import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { VRButton }      from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/webxr/VRButton.js';
import { SceneBuilder }  from './scene.js';
import { AudioSystem }   from './audio.js';
import { UIManager }     from './ui.js';
import { ParticleSystem } from './particles.js';
import { Turret }        from './turret.js';
import { InputManager }  from './input.js';
import { Drone }         from './drone.js';
import { WaveManager }   from './waves.js';
import { AbilitySystem } from './abilities.js';

export class Game {
  constructor() {
    // ── State ─────────────────────────────────────────────────
    this.state   = 'menu';   // 'menu' | 'playing' | 'gameover'
    this.score   = 0;
    this.wave    = 0;
    this.baseHP  = 100;
    this.drones  = [];       // active Drone instances
    this.vrMode  = false;

    // Ability cooldown state shared across systems
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

  // ── Renderer ──────────────────────────────────────────────────
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

    // VR button
    const btn = VRButton.createButton(this.renderer);
    document.getElementById('vr-button-container').appendChild(btn);

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

    // Camera lives inside a rig so we can move the VR origin
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, 500
    );
    this.camera.position.set(0, 1.6, 0); // desktop eye height

    this.cameraRig = new THREE.Group();
    this.cameraRig.position.set(0, 0, 2); // stand at turret position
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    // Environment
    const builder = new SceneBuilder(this.scene);
    const { baseCore, baseCoreLight, baseCorePos } = builder.build();
    this.baseCore      = baseCore;
    this.baseCoreLight = baseCoreLight;
    this.baseCorePos   = baseCorePos;
  }

  // ── Systems ───────────────────────────────────────────────────
  _initSystems() {
    this.audio     = new AudioSystem();
    this.particles = new ParticleSystem(this.scene);
    this.ui        = new UIManager(this.camera);

    this.turret = new Turret(
      this.scene, this.camera, this.cameraRig, this.renderer
    );

    this.input = new InputManager(
      this.renderer, this.cameraRig, this.camera, this.scene
    );

    this.waves = new WaveManager(this.scene, this.baseCorePos);

    this.abilitySystem = new AbilitySystem(
      this.scene, this.audio, this.particles
    );
  }

  // ── Public: start / restart ───────────────────────────────────
  start() {
    if (!this.audio.initialized) this.audio.init();

    this.state  = 'playing';
    this.score  = 0;
    this.baseHP = 100;
    this.wave   = 0;
    for (const d of this.drones) d.destroy();
    this.drones = [];
    this.abilitySystem.resetCooldowns(this.abilities);

    this.ui.hideOverlay();
    this._startNextWave();
  }

  // ── Public: use ability (called from HTML onclick or input) ───
  useAbility(name) {
    if (this.state !== 'playing') return;
    if (this.abilities[name].timer > 0) return;

    if (!this.audio.initialized) this.audio.init();
    this.audio.abilityActivate();

    this.abilities[name].timer = this.abilities[name].cd;
    this.abilitySystem.activate(name, this.drones, this.cameraRig.position);

    // Refresh score display after EMP kills
    this._syncScore();
  }

  // ── Wave logic ────────────────────────────────────────────────
  _startNextWave() {
    this.wave++;
    this.waves.startWave(this.wave);
    this.ui.announceWave(this.wave);
    this.audio.waveStart();
  }

  // ── Game over ─────────────────────────────────────────────────
  _gameOver() {
    this.state = 'gameover';
    for (const d of this.drones) d.destroy();
    this.drones = [];
    if (this.input.mouseLocked) document.exitPointerLock();
    this.ui.showOverlay(
      'GAME OVER',
      `Wave ${this.wave}  ·  Score: ${this.score}`,
      'PLAY AGAIN'
    );
  }

  // ── Score helper ──────────────────────────────────────────────
  _syncScore() {
    // Tally any kill-bonus from the ability system
    const bonus = this.abilitySystem.consumeKillBonus();
    this.score += bonus;
  }

  // ── Main loop ─────────────────────────────────────────────────
  _loop(timestamp, frame) {
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    if (this.state === 'playing') {
      this._update(dt, frame);
    }

    // Always animate the base core
    this.baseCore.rotation.y += dt * 0.55;
    this.baseCore.rotation.x += dt * 0.18;
    this.baseCoreLight.intensity = 3 * (0.7 + Math.sin(timestamp * 0.002) * 0.3);

    this.renderer.render(this.scene, this.camera);
  }

  _update(dt, frame) {
    // ── Input ────────────────────────────────────────────────
    this.input.update(dt, frame, this.vrMode);

    // ── Shooting ─────────────────────────────────────────────
    if (this.input.consumeShot()) {
      const result = this.turret.shoot(
        this.drones, this.particles, this.audio, this.vrMode
      );
      if (result.killed) {
        this.score += result.points;
        this.drones.splice(this.drones.indexOf(result.drone), 1);
      }
    }

    // ── Abilities (from VR or keyboard) ───────────────────────
    const abilityKey = this.input.consumeAbility();
    if (abilityKey) this.useAbility(abilityKey);

    // ── Cooldowns ─────────────────────────────────────────────
    for (const ab of Object.values(this.abilities)) {
      if (ab.timer > 0) ab.timer = Math.max(0, ab.timer - dt);
    }

    // ── Ability kill bonus ────────────────────────────────────
    this._syncScore();

    // ── Turret aim ────────────────────────────────────────────
    this.turret.update(dt, this.vrMode, this.input);
    const onTarget = this.turret.isAimingAtDrone(this.drones);
    this.ui.setAimOnTarget(onTarget);

    // ── Wave / drone updates ──────────────────────────────────
    const newDrones = this.waves.update(dt);
    this.drones.push(...newDrones);

    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];

      // Sweep drones killed by EMP / abilities this frame
      if (drone.dead) { this.drones.splice(i, 1); continue; }

      const dist  = drone.update(dt, this.baseCorePos, this.camera);

      if (dist < 3) {
        // Drone reached the base
        this.baseHP -= drone.spec.damage;
        this.particles.emit(this.baseCorePos.clone(), 'fire', 16, 9);
        this.audio.baseHit();
        drone.destroy();
        this.drones.splice(i, 1);

        if (this.baseHP <= 0) {
          this.baseHP = 0;
          this._gameOver();
          return;
        }
        // Camera shake
        this._shakeCamera();
      }
    }

    // ── Check wave complete ────────────────────────────────────
    if (this.waves.isComplete() && this.drones.length === 0) {
      this.waves.scheduleNext(() => this._startNextWave(), 4);
    }

    // ── Ability system (defense turrets, EMP rings) ──────────
    this.abilitySystem.update(dt, this.drones);
    this._syncScore();

    // ── Particles ─────────────────────────────────────────────
    this.particles.update(dt);

    // ── UI ────────────────────────────────────────────────────
    this.ui.update({
      score:     this.score,
      wave:      this.wave,
      drones:    this.drones.length,
      baseHP:    this.baseHP,
      abilities: this.abilities,
    });
  }

  _shakeCamera() {
    const orig = this.cameraRig.position.clone();
    this.cameraRig.position.x += (Math.random() - 0.5) * 0.12;
    this.cameraRig.position.y += (Math.random() - 0.5) * 0.06;
    setTimeout(() => this.cameraRig.position.copy(orig), 180);
  }
}
