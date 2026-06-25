import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ── Single projectile ──────────────────────────────────────────
class Projectile {
  constructor(scene, origin, direction, speed, color, size, maxRange) {
    this._scene   = scene;
    this._dir     = direction.clone().normalize();
    this._speed   = speed;
    this._maxRange = maxRange;
    this._traveled = 0;
    this.alive    = true;

    // Root group (no sphere — trail only)
    this.mesh = new THREE.Group();
    this.mesh.position.copy(origin);

    // Glow trail — fixed short length so it doesn't clip through the gun
    const trailLen = 0.35;
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.12, size * 0.12, trailLen, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.set(0, 0, -trailLen * 0.5); // sit behind centre
    this.mesh.add(trail);

    // Orient group so +Z = forward
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), this._dir
    );
    this.mesh.quaternion.copy(q);

    scene.add(this.mesh);
  }

  update(dt) {
    const step = this._speed * dt;
    this.mesh.position.addScaledVector(this._dir, step);
    this._traveled += step;
    if (this._traveled >= this._maxRange) {
      this.alive = false;
    }
  }

  dispose() {
    this._scene.remove(this.mesh);
  }
}

// ── ProjectileManager ─────────────────────────────────────────
export class ProjectileManager {
  constructor(scene) {
    this._scene   = scene;
    this._player  = [];  // player-fired bullets
    this._enemy   = [];  // drone-fired bullets
  }

  firePlayer(origin, direction) {
    this._player.push(new Projectile(
      this._scene, origin, direction,
      90,        // speed  m/s
      0xffdd00,  // yellow
      0.055,     // size
      120        // max range
    ));
  }

  fireEnemy(origin, direction) {
    this._enemy.push(new Projectile(
      this._scene, origin, direction,
      14,        // slower – dodgeable
      0xff2200,  // red
      0.10,      // bigger – visible
      80
    ));
  }

  // Returns { hitDrones: Set<Drone>, playerDamage: number }
  update(dt, drones, playerWorldPos) {
    const hitDrones   = new Set();
    let   playerDamage = 0;

    // ── Player bullets ────────────────────────────────────────
    for (let i = this._player.length - 1; i >= 0; i--) {
      const b = this._player[i];
      b.update(dt);

      if (!b.alive) {
        b.dispose();
        this._player.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const d of drones) {
        if (d.dead) continue;
        if (b.mesh.position.distanceTo(d.group.position) < d.spec.size * 1.3) {
          hitDrones.add(d);
          hit = true;
          break;
        }
      }
      if (hit) {
        b.alive = false;
        b.dispose();
        this._player.splice(i, 1);
      }
    }

    // ── Enemy bullets ─────────────────────────────────────────
    for (let i = this._enemy.length - 1; i >= 0; i--) {
      const b = this._enemy[i];
      b.update(dt);

      if (!b.alive) {
        b.dispose();
        this._enemy.splice(i, 1);
        continue;
      }

      if (b.mesh.position.distanceTo(playerWorldPos) < 0.75) {
        playerDamage += 5;
        b.dispose();
        this._enemy.splice(i, 1);
      }
    }

    return { hitDrones, playerDamage };
  }

  clear() {
    [...this._player, ...this._enemy].forEach(b => b.dispose());
    this._player = [];
    this._enemy  = [];
  }
}
