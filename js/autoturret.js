import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class AutoTurret {
  constructor(scene, cameraRig, side) {
    this._scene  = scene;
    this._rig    = cameraRig;
    this._side   = side; // 'left' | 'right'

    this._fireCooldownMax = 3.0;
    this._fireCooldown    = 0;
    this._riseT           = 0;   // 0→1 rise animation
    this._flashTimer      = 0;

    this._build();
  }

  _build() {
    const mat = {
      dark:   new THREE.MeshLambertMaterial({ color: 0x1a2230 }),
      mid:    new THREE.MeshLambertMaterial({ color: 0x2e3e50 }),
      light:  new THREE.MeshLambertMaterial({ color: 0x4a6070 }),
      accent: new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      barrel: new THREE.MeshLambertMaterial({ color: 0x0d1218 }),
    };

    this._group = new THREE.Group();
    const xPos  = this._side === 'left' ? -3.2 : 3.2;
    this._group.position.set(xPos, -2, -1.0); // below platform, rises up
    this._rig.add(this._group);

    // Circular base plate
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.24, 0.06, 10), mat.mid
    );
    this._group.add(plate);

    // Neon ring on base
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.20, 0.015, 5, 20),
      new THREE.MeshBasicMaterial({ color: this._side === 'left' ? 0x00ccff : 0xff00cc })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.04;
    this._group.add(baseRing);

    // Post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.064, 0.38, 7), mat.dark
    );
    post.position.y = 0.22;
    this._group.add(post);

    // Collar between post and housing
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.060, 0.06, 8), mat.mid
    );
    collar.position.y = 0.45;
    this._group.add(collar);

    // Swivel pivot (rotates to aim)
    this._pivot = new THREE.Group();
    this._pivot.position.y = 0.50;
    this._group.add(this._pivot);

    // Housing block
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.10, 0.20), mat.dark
    );
    this._pivot.add(housing);

    // Accent glow strip on housing
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.008, 0.012),
      new THREE.MeshBasicMaterial({ color: this._side === 'left' ? 0x00ccff : 0xff00cc })
    );
    strip.position.set(0, 0.054, -0.09);
    this._pivot.add(strip);

    // Side fins
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.07, 0.16), mat.light
      );
      fin.position.set(sx * 0.076, 0, 0);
      this._pivot.add(fin);
    }

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.42, 6), mat.barrel
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.31;
    this._pivot.add(barrel);

    // Muzzle tip ring
    const tip = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.008, 5, 10), mat.light
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.52;
    this._pivot.add(tip);

    // Muzzle flash (hidden)
    this._flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 5, 3),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0 })
    );
    this._flash.position.z = -0.53;
    this._pivot.add(this._flash);
  }

  // Returns true if a shot was fired this frame (caller adds projectile)
  update(dt, drones, projectileManager) {
    // Rise animation (2 seconds)
    if (this._riseT < 1) {
      this._riseT = Math.min(this._riseT + dt * 0.5, 1);
      const e = 1 - Math.pow(1 - this._riseT, 3); // ease-out cubic
      this._group.position.y = -2 + 2 * e;
    }

    // Cooldown
    if (this._fireCooldown > 0) this._fireCooldown -= dt;

    // Flash fade
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      this._flash.material.opacity = Math.max(0, this._flashTimer / 0.06);
    }

    // Aim + fire
    const target = this._nearest(drones);
    if (target && this._riseT >= 1) {
      const origin = new THREE.Vector3();
      this._pivot.getWorldPosition(origin);
      const dir = new THREE.Vector3()
        .subVectors(target.group.position, origin).normalize();

      // Rotate pivot toward target
      const parentQ = new THREE.Quaternion();
      this._group.getWorldQuaternion(parentQ);
      const localDir = dir.clone().applyQuaternion(parentQ.conjugate());
      this._pivot.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1), localDir
      );

      if (this._fireCooldown <= 0) {
        this._fireCooldown = this._fireCooldownMax;
        this._flash.material.opacity = 1;
        this._flashTimer = 0.06;

        const muzzle = new THREE.Vector3();
        this._flash.getWorldPosition(muzzle);
        projectileManager.firePlayer(muzzle, dir);
      }
    }
  }

  setFireCooldown(val) { this._fireCooldownMax = val; }

  _nearest(drones) {
    let best = null, bestD = Infinity;
    const pos = new THREE.Vector3();
    this._pivot.getWorldPosition(pos);
    for (const d of drones) {
      if (d.dead) continue;
      const dist = pos.distanceTo(d.group.position);
      if (dist < bestD) { best = d; bestD = dist; }
    }
    return best;
  }

  destroy() { this._rig.remove(this._group); }
}
