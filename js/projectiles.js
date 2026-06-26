import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Minimum distance from point p to segment [a, b]
function segPointDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  if (len2 === 0) {
    const dx = px - ax, dy = py - ay, dz = pz - az;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const t = Math.max(0, Math.min(1,
    ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2));
  const cx = ax + t * abx, cy = ay + t * aby, cz = az + t * abz;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Single projectile ──────────────────────────────────────────
class Projectile {
  constructor(scene, origin, direction, speed, color, size, maxRange) {
    this._scene   = scene;
    this._dir     = direction.clone().normalize();
    this._speed   = speed;
    this._maxRange = maxRange;
    this._traveled = 0;
    this.alive    = true;
    this._prevPos = origin.clone();

    // Root group (no sphere — trail only)
    this.mesh = new THREE.Group();
    this.mesh.position.copy(origin);

    // Outer glow trail
    const trailLen = 0.50;
    const outerR   = size * 0.45;
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(outerR, outerR, trailLen, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 })
    );
    trail.rotation.x = Math.PI / 2;
    trail.position.set(0, 0, -trailLen * 0.5);
    this.mesh.add(trail);

    // Bright inner core
    const innerR = size * 0.18;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(innerR, innerR, trailLen + 0.04, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0, -trailLen * 0.5);
    this.mesh.add(core);

    // Orient group so +Z = forward
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), this._dir
    );
    this.mesh.quaternion.copy(q);

    scene.add(this.mesh);
  }

  update(dt) {
    this._prevPos.copy(this.mesh.position);
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

  // Returns { hitDrones: Set<Drone>, hitExtras: Set, playerDamage: number }
  // extras = boss and/or missiles (same interface: group.position, spec.size, dead)
  update(dt, drones, playerWorldPos, extras = []) {
    const hitDrones   = new Set();
    const hitExtras   = new Set();
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

      // Check regular drones first
      for (const d of drones) {
        if (d.dead) continue;
        const dp = d.group.position;
        const dist = segPointDist(
          b._prevPos.x, b._prevPos.y, b._prevPos.z,
          b.mesh.position.x, b.mesh.position.y, b.mesh.position.z,
          dp.x, dp.y, dp.z
        );
        if (dist < d.spec.size * 1.2) {
          hitDrones.add(d);
          hit = true;
          break;
        }
      }

      // Check extras (boss, missiles) if no drone was hit
      if (!hit) {
        for (const e of extras) {
          if (e.dead) continue;
          const ep = e.group.position;
          const dist = segPointDist(
            b._prevPos.x, b._prevPos.y, b._prevPos.z,
            b.mesh.position.x, b.mesh.position.y, b.mesh.position.z,
            ep.x, ep.y, ep.z
          );
          if (dist < e.spec.size * 1.2) {
            hitExtras.add(e);
            hit = true;
            break;
          }
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

    return { hitDrones, hitExtras, playerDamage };
  }

  clear() {
    [...this._player, ...this._enemy].forEach(b => b.dispose());
    this._player = [];
    this._enemy  = [];
  }
}
