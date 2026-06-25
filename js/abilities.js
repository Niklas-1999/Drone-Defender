import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { Drone, DRONE_TYPES } from './drone.js';

// ── Defense turret (spawned by the Turret ability) ────────────
class DefenseTurret {
  constructor(scene, position) {
    this._scene     = scene;
    this.lifetime   = 10;     // seconds remaining
    this._fireCd    = 0;
    this._killedDrones = []; // drones killed this frame

    // Visuals
    this._group = new THREE.Group();
    this._group.position.copy(position);
    this._group.position.y = 0;

    const mat  = new THREE.MeshLambertMaterial({ color: 0x225577 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.3, 8), mat);
    this._group.add(base);

    this._barrelPivot = new THREE.Group();
    this._group.add(this._barrelPivot);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6),
      new THREE.MeshLambertMaterial({ color: 0x4488aa })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.35;
    this._barrelPivot.add(barrel);

    // HP ring (shrinks as lifetime decreases)
    this._hpRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.03, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff88 })
    );
    this._hpRing.rotation.x = Math.PI / 2;
    this._hpRing.position.y = 0.18;
    this._group.add(this._hpRing);

    scene.add(this._group);
  }

  update(dt, drones, particles, audio) {
    this.lifetime -= dt;
    this._fireCd  -= dt;
    this._killedDrones = [];

    // Update hp ring
    const frac = Math.max(0, this.lifetime / 10);
    this._hpRing.material.color.setHSL(frac * 0.33, 1, 0.5);

    if (!drones.length) return;

    // Find nearest drone
    let nearest = null, nearDist = 90;
    for (const d of drones) {
      const dist = d.group.position.distanceTo(this._group.position);
      if (dist < nearDist) { nearDist = dist; nearest = d; }
    }

    if (!nearest) return;

    // Aim
    this._barrelPivot.lookAt(nearest.group.position);
    this._barrelPivot.rotateX(Math.PI / 2);

    // Fire
    if (this._fireCd <= 0) {
      this._fireCd = 0.55;
      audio?.hit();
      const killed = nearest.hit(1);
      const fp = this._group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      particles?.addTracer(fp, nearest.group.position.clone());
      if (killed) {
        particles?.emit(nearest.group.position.clone(), 'fire', 10, 7);
        audio?.explosion(0.5);
        this._killedDrones.push(nearest);
      }
    }
  }

  consumeKills() {
    const k = this._killedDrones;
    this._killedDrones = [];
    return k;
  }

  isAlive() { return this.lifetime > 0; }

  destroy() {
    this._scene.remove(this._group);
  }
}

// ── EMP ring effect ───────────────────────────────────────────
class EMPRing {
  constructor(scene, position) {
    this._scene = scene;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ccff, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this._mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 8, 40), mat);
    this._mesh.position.copy(position);
    this._mesh.rotation.x = Math.PI / 2;
    this.life = 1.0;
    scene.add(this._mesh);
  }

  update(dt) {
    this.life -= dt * 1.6;
    const s = 1 + (1 - this.life) * 35;
    this._mesh.scale.setScalar(s);
    this._mesh.material.opacity = Math.max(0, this.life * 0.55);
    return this.life > 0;
  }

  dispose() { this._scene.remove(this._mesh); }
}

// ── AbilitySystem ─────────────────────────────────────────────
export class AbilitySystem {
  constructor(scene, audio, particles) {
    this._scene     = scene;
    this._audio     = audio;
    this._particles = particles;

    this._defenseTurrets = [];
    this._empRings       = [];
    this._killBonus      = 0;  // points accrued from defense turret kills
  }

  resetCooldowns(abilities) {
    for (const ab of Object.values(abilities)) ab.timer = 0;
  }

  // ── Activate an ability ───────────────────────────────────────
  activate(name, drones, playerPos) {
    if (name === 'scan')   this._activateScan(drones);
    if (name === 'emp')    this._activateEMP(drones, playerPos);
    if (name === 'turret') this._activateTurret(playerPos);
  }

  // SCAN – reveal all drones for 5 s
  _activateScan(drones) {
    for (const d of drones) d.applyScanned(5);
  }

  // EMP – stun + damage all, kill weak ones
  _activateEMP(drones, playerPos) {
    this._audio?.emp();

    // Expanding ring at player position
    this._empRings.push(new EMPRing(this._scene, playerPos.clone()));

    for (const d of drones) {
      this._particles.emit(d.group.position.clone(), 'emp', 6, 5);
      d.stun(4);
      const killed = d.hit(2);
      if (killed) {
        this._particles.emit(d.group.position.clone(), 'fire', 10, 8);
        this._audio?.explosion(d.spec.size);
        this._killBonus += d.spec.points;
        d.destroy();
      }
    }
  }

  // DEFENSE TURRET – spawn a support gun near player
  _activateTurret(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const offset = new THREE.Vector3(Math.cos(angle) * 3.5, 0, Math.sin(angle) * 3.5);
    const pos = playerPos.clone().add(offset);
    this._defenseTurrets.push(new DefenseTurret(this._scene, pos));
  }

  // ── Per-frame update ──────────────────────────────────────────
  // Must be called from game loop; pass live drone array so turrets can shoot.
  update(dt, drones) {
    // Update defense turrets
    for (let i = this._defenseTurrets.length - 1; i >= 0; i--) {
      const turret = this._defenseTurrets[i];
      turret.update(dt, drones, this._particles, this._audio);

      // Remove kills from the drones array
      for (const killed of turret.consumeKills()) {
        const idx = drones.indexOf(killed);
        if (idx !== -1) {
          this._killBonus += killed.spec.points;
          drones.splice(idx, 1);
        }
      }

      if (!turret.isAlive()) {
        turret.destroy();
        this._defenseTurrets.splice(i, 1);
      }
    }

    // Update EMP rings
    for (let i = this._empRings.length - 1; i >= 0; i--) {
      if (!this._empRings[i].update(dt)) {
        this._empRings[i].dispose();
        this._empRings.splice(i, 1);
      }
    }
  }

  // Returns and resets the accumulated kill-bonus points.
  consumeKillBonus() {
    const b = this._killBonus;
    this._killBonus = 0;
    return b;
  }
}
