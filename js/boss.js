import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Hover positions: in front of player at varying heights and x offsets
const BOSS_SPOTS = [
  new THREE.Vector3(  0, 13, -35),
  new THREE.Vector3(-20, 11, -28),
  new THREE.Vector3( 20, 11, -28),
  new THREE.Vector3(-13, 17, -45),
  new THREE.Vector3( 13, 17, -45),
  new THREE.Vector3(  0,  9, -22),
  new THREE.Vector3(-18, 15, -38),
  new THREE.Vector3( 18, 15, -38),
];

// ── Missile ────────────────────────────────────────────────────
export class Missile {
  constructor(fromPos, targetPos, scene) {
    this.hp     = 10;
    this.maxHp  = 10;
    this.dead   = false;
    this.damage = 25;
    this._scene = scene;
    this.speed  = 7;         // m/s — slow enough to shoot down
    this.spec   = { size: 0.40 }; // CCD hitbox radius
    this._dir   = new THREE.Vector3().subVectors(targetPos, fromPos).normalize();
    this._hitFlash = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(fromPos);
    // Orient immediately so nose points at target
    this.group.lookAt(fromPos.clone().add(this._dir));
    scene.add(this.group);
  }

  _buildMesh() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xff4400 });

    // Body: cylinder along local Z
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.80, 8), mat);
    body.rotation.x = Math.PI / 2;
    this.group.add(body);

    // Nose cone at front (-Z in group local space)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.35, 8), mat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.575;
    this.group.add(nose);

    // Exhaust glow at back (+Z)
    this._exhaustMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 5),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.85 })
    );
    this._exhaustMesh.position.z = 0.48;
    this.group.add(this._exhaustMesh);

    // 4 fins at back
    const finMat = new THREE.MeshLambertMaterial({ color: 0xcc2200, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), finMat);
      fin.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.40);
      fin.rotation.x = Math.PI / 2;
      fin.rotation.z = a;
      this.group.add(fin);
    }

    // Small HP bar (always visible)
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 64; hpCanvas.height = 6;
    this._hpCtx = hpCanvas.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(hpCanvas);
    this._hpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.70, 0.09),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpMesh.position.y = 0.42;
    this.group.add(this._hpMesh);
    this._redrawHPBar();
  }

  _redrawHPBar() {
    const ctx = this._hpCtx;
    ctx.clearRect(0, 0, 64, 6);
    ctx.fillStyle = '#330000'; ctx.fillRect(0, 0, 64, 6);
    ctx.fillStyle = '#ff6600'; ctx.fillRect(0, 0, 64 * Math.max(0, this.hp / this.maxHp), 6);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._hitFlash = 0.07;
    this._redrawHPBar();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, targetPos, camera) {
    if (this.dead) return { dist: Infinity };

    this._hitFlash = Math.max(0, this._hitFlash - dt);

    // Pulsing exhaust
    this._exhaustMesh.material.opacity = 0.7 + Math.sin(Date.now() * 0.025) * 0.15;

    // Gentle homing toward current player position
    const toTarget = new THREE.Vector3().subVectors(targetPos, this.group.position);
    const dist = toTarget.length();
    this._dir.lerp(toTarget.normalize(), 0.05).normalize();
    this.group.position.addScaledVector(this._dir, this.speed * dt);

    // lookAt: nose (-Z in group) points in travel direction
    this.group.lookAt(this.group.position.clone().add(this._dir));

    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    return { dist };
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss ───────────────────────────────────────────────────────
export class Boss {
  constructor(scene) {
    this.hp     = 300;
    this.maxHp  = 300;
    this.dead   = false;
    this.points = 5000;
    this._scene = scene;
    this.spec   = { size: 2.55 }; // 3× titan (0.85) — CCD hitbox

    this._state           = 'hovering';
    this._hoverTimer      = 0;
    this._hoverDuration   = 5.0;
    this._missileTimer    = 2.0;   // first missile fires after 2s
    this._missileInterval = 2.2;
    this._zipSpeed        = 95;    // m/s — appears as a flash
    this._zipTarget       = null;
    this._hitFlash        = 0;
    this._animTimer       = 0;
    this._phase           = 1;    // escalates at 200 HP and 100 HP

    this._spots   = this._shuffled();
    this._spotIdx = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.copy(this._spots[0]);
    scene.add(this.group);
  }

  _shuffled() {
    const s = BOSS_SPOTS.map(v => v.clone());
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s;
  }

  _buildMesh() {
    const S = 2.55;

    // Body: smooth subdivided octahedron, light purple
    this._bodyMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(S * 0.5, 2),
      new THREE.MeshLambertMaterial({ color: 0xcc88ff })
    );
    this.group.add(this._bodyMesh);

    // Glowing inner energy core
    this._coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(S * 0.21, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff99ff, transparent: true, opacity: 0.75 })
    );
    this.group.add(this._coreMesh);

    // Equatorial armor ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(S * 0.57, 0.09, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xdd66ff })
    );
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Glowing eye (front, +Z of group)
    this._eyeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(S * 0.10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    this._eyeMesh.position.z = S * 0.47;
    this.group.add(this._eyeMesh);

    // 4 large arms with propellers
    const armMat  = new THREE.MeshLambertMaterial({ color: 0x553366 });
    const propMat = new THREE.MeshBasicMaterial({
      color: 0xdd88ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    this._propellers = [];
    const armLen = S * 0.72;

    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 4) * Math.PI * 2;

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, armLen, 5), armMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.x = armLen / 2;
      pivot.add(arm);

      const prop = new THREE.Mesh(new THREE.CircleGeometry(S * 0.38, 9), propMat);
      prop.rotation.x = Math.PI / 2;
      prop.position.x = armLen;
      pivot.add(prop);
      this._propellers.push(prop);

      this.group.add(pivot);
    }

    // World HP bar (large, above the boss)
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 256; hpCanvas.height = 22;
    this._hpCtx = hpCanvas.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(hpCanvas);
    this._hpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.0, 0.44),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpMesh.position.y = S * 0.77;
    this.group.add(this._hpMesh);
    this._redrawHPBar();
  }

  _redrawHPBar() {
    const ctx = this._hpCtx;
    const W = 256, H = 22;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a0028'; ctx.fillRect(0, 0, W, H);
    const pct  = Math.max(0, this.hp / this.maxHp);
    const grad = ctx.createLinearGradient(0, 0, (W - 4) * pct, 0);
    grad.addColorStop(0, '#ff44ff');
    grad.addColorStop(1, '#9900ee');
    ctx.fillStyle = grad;
    ctx.fillRect(2, 2, (W - 4) * pct, H - 4);
    ctx.strokeStyle = '#cc66ff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    if (this._state === 'zipping') return false; // invulnerable during the dash
    this.hp -= damage;
    this._hitFlash = 0.10;
    this._redrawHPBar();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  _updatePhase() {
    if (this.hp <= 100 && this._phase < 3) {
      this._phase           = 3;
      this._hoverDuration   = 2.5;  // -1s from phase 2
      this._missileInterval = 1.1;  // double rate vs phase 1 (2.2 / 2)
      if (this._missileTimer > this._missileInterval) this._missileTimer = this._missileInterval;
    } else if (this.hp <= 200 && this._phase < 2) {
      this._phase           = 2;
      this._hoverDuration   = 3.5;  // -1.5s from phase 1
      this._missileInterval = 1.47; // 50% faster (2.2 / 1.5)
      if (this._missileTimer > this._missileInterval) this._missileTimer = this._missileInterval;
    }
  }

  // Returns array of newly spawned Missile objects
  update(dt, targetPos, scene, camera) {
    if (this.dead) return [];
    this._animTimer += dt;
    this._updatePhase();
    const newMissiles = [];

    // ── Visuals ───────────────────────────────────────────────
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      this._bodyMesh.material.color.setHex(0xffffff);
    } else if (this._state === 'zipping') {
      this._bodyMesh.material.color.setHex(0xffffff); // bright white flash during zip
    } else {
      this._bodyMesh.material.color.setHex(0xcc88ff);
    }

    // Pulsing core + eye
    this._coreMesh.material.opacity = 0.55 + 0.20 * Math.sin(this._animTimer * 3.2);
    this._eyeMesh.material.color.setRGB(1, 0.15 + 0.30 * Math.sin(this._animTimer * 5), 1);

    // Propellers always spin
    for (const p of this._propellers) p.rotation.z += dt * 7;

    // ── State machine ─────────────────────────────────────────
    if (this._state === 'hovering') {
      const spot = this._spots[this._spotIdx];

      // Bob gently
      this.group.position.y = spot.y + Math.sin(this._animTimer * 1.8) * 0.45;

      // Face player (eye/+Z toward player)
      const toP = new THREE.Vector3(
        targetPos.x - this.group.position.x, 0,
        targetPos.z - this.group.position.z
      );
      this.group.rotation.set(0, Math.atan2(toP.x, toP.z), 0);

      // Missile fire
      this._missileTimer -= dt;
      if (this._missileTimer <= 0) {
        this._missileTimer = this._missileInterval;
        newMissiles.push(this._spawnMissile(scene, targetPos));
      }

      // Hover timeout → zip
      this._hoverTimer += dt;
      if (this._hoverTimer >= this._hoverDuration) {
        this._hoverTimer = 0;
        this._startZip();
      }

    } else {
      // Zip toward next spot
      const toSpot = new THREE.Vector3().subVectors(this._zipTarget, this.group.position);
      const dist   = toSpot.length();
      if (dist < 0.6) {
        this.group.position.copy(this._zipTarget);
        this._state       = 'hovering';
        this._missileTimer = 1.8; // brief pause before first missile at new spot
      } else {
        const speed = Math.min(this._zipSpeed, dist / dt);
        this.group.position.addScaledVector(toSpot.normalize(), speed * dt);
        // Face travel direction
        this.group.rotation.set(0, Math.atan2(toSpot.x, toSpot.z), 0);
      }
    }

    // Billboard HP bar to camera
    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));

    return newMissiles;
  }

  _startZip() {
    this._spotIdx  = (this._spotIdx + 1) % this._spots.length;
    this._zipTarget = this._spots[this._spotIdx].clone();
    this._state    = 'zipping';
  }

  _spawnMissile(scene, targetPos) {
    const offset = new THREE.Vector3((Math.random() - 0.5) * 2, -1.2, 0);
    return new Missile(this.group.position.clone().add(offset), targetPos, scene);
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}
