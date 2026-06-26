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
    this.kind   = 'missile';
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
    this.kind   = 'boss';
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

// ── ShieldOrb (Boss 2) ─────────────────────────────────────────
export class ShieldOrb {
  constructor(scene, orbitIndex, numOrbs) {
    this.hp     = 3;
    this.maxHp  = 3;
    this.dead   = false;
    this.kind   = 'shield';
    this._scene = scene;
    this.spec   = { size: 0.35 };
    this._orbitAngle  = (orbitIndex / numOrbs) * Math.PI * 2;
    this._orbitRadius = 3.5;
    this._orbitSpeed  = 1.1;
    this._hitFlash    = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    scene.add(this.group);
  }

  _buildMesh() {
    this._shellMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 8),
      new THREE.MeshLambertMaterial({ color: 0x882299 })
    );
    this.group.add(this._shellMesh);

    this._coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xdd55ff, transparent: true, opacity: 0.85 })
    );
    this.group.add(this._coreMesh);

    this._ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.035, 6, 20),
      new THREE.MeshBasicMaterial({ color: 0xbb44ee })
    );
    this.group.add(this._ringMesh);

    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 32; hpCanvas.height = 4;
    this._hpCtx = hpCanvas.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(hpCanvas);
    this._hpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.055),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpMesh.position.y = 0.44;
    this.group.add(this._hpMesh);
    this._redrawHP();
  }

  _redrawHP() {
    const ctx = this._hpCtx;
    ctx.clearRect(0, 0, 32, 4);
    ctx.fillStyle = '#330044'; ctx.fillRect(0, 0, 32, 4);
    ctx.fillStyle = '#cc44ff';
    ctx.fillRect(0, 0, 32 * Math.max(0, this.hp / this.maxHp), 4);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._hitFlash = 0.07;
    this._redrawHP();
    if (this.hp <= 0) {
      this.dead = true;
      this.group.visible = false;
      return true;
    }
    return false;
  }

  revive() {
    this.hp   = this.maxHp;
    this.dead = false;
    this.group.visible = true;
    this._redrawHP();
  }

  update(dt, bossPos, camera) {
    if (this.dead) return;
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    this._orbitAngle += this._orbitSpeed * dt;

    const r  = this._orbitRadius;
    this.group.position.set(
      bossPos.x + Math.cos(this._orbitAngle) * r,
      bossPos.y + Math.sin(this._orbitAngle * 0.6) * 1.4,
      bossPos.z + Math.sin(this._orbitAngle) * r
    );

    this._ringMesh.rotation.y += dt * 2.5;
    this._ringMesh.rotation.x += dt * 1.3;
    this._shellMesh.material.color.setHex(this._hitFlash > 0 ? 0xffffff : 0x882299);

    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss 2 ─────────────────────────────────────────────────────
export class Boss2 {
  constructor(scene) {
    this.hp     = 240;
    this.maxHp  = 240;
    this.dead   = false;
    this.kind   = 'boss';
    this.points = 8000;
    this._scene = scene;
    this.spec   = { size: 2.55 };

    // _orbitAngle drives a sine-sweep so the boss stays in the forward arc
    this._orbitAngle   = Math.random() * Math.PI * 2;
    this._orbitRadius  = 38;
    this._orbitSpeed   = 0.115; // rad/s phase 1 (~half previous)
    this._orbitHeight  = 12;
    this._sweepHalf    = 52 * (Math.PI / 180); // ±52° forward arc (matches drone spawn zone)

    this._phase           = 1;
    this._vulnerable      = false;
    this._vulnerableTimer = 0;
    this._vulnerableDur   = 8.0;
    this._hitFlash        = 0;
    this._animTimer       = 0;

    this._missileInterval = 4.9; // seconds between missiles (phase 1, -40% rate)
    this._missileTimer    = 2.5; // initial delay before first shot

    this.shields = [];
    for (let i = 0; i < 3; i++) this.shields.push(new ShieldOrb(scene, i, 3));

    this.group = new THREE.Group();
    this._buildMesh();
    const initSweep = Math.sin(this._orbitAngle) * this._sweepHalf;
    this.group.position.set(
      Math.sin(initSweep) * this._orbitRadius,
      this._orbitHeight,
      -Math.cos(initSweep) * this._orbitRadius
    );
    scene.add(this.group);
  }

  _buildMesh() {
    const S = 2.55;

    // Angular icosahedron — distinct from Boss 1's octahedron
    this._bodyMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(S * 0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0x9933cc })
    );
    this.group.add(this._bodyMesh);

    this._coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(S * 0.20, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xdd55ff, transparent: true, opacity: 0.80 })
    );
    this.group.add(this._coreMesh);

    // 6 spike cones pointing along ±X ±Y ±Z
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x661199 });
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, S * 0.55, 5), spikeMat);
      const dir = new THREE.Vector3(dx, dy, dz);
      spike.position.copy(dir.clone().multiplyScalar(S * 0.52));
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.group.add(spike);
    }

    // 3 glowing eyes at +Z face in a triangle
    this._eyes = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(S * 0.07, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xff00ff })
      );
      eye.position.set(Math.cos(a) * S * 0.24, Math.sin(a) * S * 0.24, S * 0.47);
      this.group.add(eye);
      this._eyes.push(eye);
    }

    // HP bar
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
    grad.addColorStop(0, '#cc44ff');
    grad.addColorStop(1, '#770099');
    ctx.fillStyle = grad;
    ctx.fillRect(2, 2, (W - 4) * pct, H - 4);
    ctx.strokeStyle = '#9933cc'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    this._hpTex.needsUpdate = true;
  }

  _updatePhase() {
    if (this.hp <= 80 && this._phase < 3) {
      this._phase           = 3;
      this._orbitSpeed      = 0.285;
      this._vulnerableDur   = 4.0;
      this._missileInterval = 2.0;
      if (this._missileTimer > this._missileInterval) this._missileTimer = this._missileInterval;
    } else if (this.hp <= 160 && this._phase < 2) {
      this._phase           = 2;
      this._orbitSpeed      = 0.185;
      this._missileInterval = 3.1;
      if (this._missileTimer > this._missileInterval) this._missileTimer = this._missileInterval;
      this._vulnerableDur = 6.0;
    }
  }

  hit(damage = 1) {
    if (this.dead) return false;
    if (!this._vulnerable) return false;
    this.hp -= damage;
    this._hitFlash = 0.10;
    this._redrawHPBar();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, targetPos, scene, camera) {
    if (this.dead) return [];
    this._animTimer += dt;
    this._updatePhase();

    // Pendulum sweep within the forward drone-spawn arc (±52°)
    this._orbitAngle += this._orbitSpeed * dt;
    const sweep = Math.sin(this._orbitAngle) * this._sweepHalf;
    this.group.position.set(
      Math.sin(sweep) * this._orbitRadius,
      this._orbitHeight + Math.sin(this._orbitAngle * 1.5) * 2.5,
      -Math.cos(sweep) * this._orbitRadius
    );

    // Eye cluster (+Z) always faces toward player at origin
    const toPlayer = new THREE.Vector3(
      -this.group.position.x, 0, -this.group.position.z
    ).normalize();
    this.group.rotation.set(0, Math.atan2(toPlayer.x, toPlayer.z), 0);

    // Body slowly self-rotates for visual interest
    this._bodyMesh.rotation.y += dt * 0.5;
    this._bodyMesh.rotation.z += dt * 0.3;

    // ── Visuals ───────────────────────────────────────────────
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      this._bodyMesh.material.color.setHex(0xffffff);
    } else if (this._vulnerable) {
      // Bright rapid pulse — signals to player the window is open
      const p = 0.5 + 0.5 * Math.sin(this._animTimer * 9);
      this._bodyMesh.material.color.setHSL(0.78, 1.0, 0.50 + p * 0.22);
    } else {
      this._bodyMesh.material.color.setHex(0x9933cc);
    }

    this._coreMesh.material.opacity = 0.55 + 0.25 * Math.sin(this._animTimer * 3.5);
    for (const eye of this._eyes) {
      eye.material.color.setRGB(1, 0.1 + 0.3 * Math.sin(this._animTimer * 4 + eye.position.x), 1);
    }

    // ── Vulnerability window ──────────────────────────────────
    const allShieldsDown = this.shields.every(s => s.dead);
    if (this._vulnerable) {
      this._vulnerableTimer -= dt;
      if (this._vulnerableTimer <= 0) {
        this._vulnerable = false;
        for (const s of this.shields) s.revive();
      }
    } else if (allShieldsDown) {
      this._vulnerable      = true;
      this._vulnerableTimer = this._vulnerableDur;
    }

    // ── Shield orbit update ───────────────────────────────────
    for (const shield of this.shields) {
      shield.update(dt, this.group.position, camera);
    }

    // ── Missile spawn ─────────────────────────────────────────
    const newMissiles = [];
    this._missileTimer -= dt;
    if (this._missileTimer <= 0) {
      this._missileTimer = this._missileInterval;
      newMissiles.push(this._spawnMissile(scene, targetPos));
    }

    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    return newMissiles;
  }

  _spawnMissile(scene, targetPos) {
    const offset = new THREE.Vector3((Math.random() - 0.5) * 2, -1.2, 0);
    return new Missile(this.group.position.clone().add(offset), targetPos, scene);
  }

  destroy() {
    this.dead = true;
    for (const s of this.shields) s.destroy();
    this._scene.remove(this.group);
  }
}
