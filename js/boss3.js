import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { ShieldOrb } from './boss.js';

// Robot anchored here — centered ahead of player, far back
const RX = 0, RY = 0, RZ = -72;

// Phase-3 head floats into the normal combat zone
const HEAD_SPOTS = [
  new THREE.Vector3(  0, 14, -32),
  new THREE.Vector3(-18, 11, -26),
  new THREE.Vector3( 18, 11, -26),
  new THREE.Vector3(-10, 16, -44),
  new THREE.Vector3( 10, 16, -44),
  new THREE.Vector3(  0, 10, -22),
  new THREE.Vector3(-16, 13, -36),
  new THREE.Vector3( 16, 13, -36),
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Boss3Rocket ─────────────────────────────────────────────────
// Bigger, tougher version of Missile — same update() signature
export class Boss3Rocket {
  constructor(fromPos, targetPos, scene) {
    this.hp     = 20;
    this.maxHp  = 20;
    this.dead   = false;
    this.kind   = 'missile';
    this.damage = 35;
    this._scene = scene;
    this.spec   = { size: 0.70 };
    this.speed  = 11;
    this._hitFlash = 0;
    this._dir   = new THREE.Vector3().subVectors(targetPos, fromPos).normalize();

    this.group = new THREE.Group();
    this.group.position.copy(fromPos);
    this._buildMesh();
    this.group.lookAt(fromPos.clone().add(this._dir));
    scene.add(this.group);
  }

  _buildMesh() {
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x220000 });
    const redMat  = new THREE.MeshLambertMaterial({ color: 0xcc1100 });
    const finMat  = new THREE.MeshLambertMaterial({ color: 0x880000, side: THREE.DoubleSide });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 8), darkMat);
    body.rotation.x = Math.PI / 2;
    this.group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 8), redMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.28;
    this.group.add(nose);

    this._exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 5),
      new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 })
    );
    this._exhaust.position.z = 0.98;
    this.group.add(this._exhaust);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), finMat);
      fin.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.95);
      fin.rotation.x = Math.PI / 2;
      fin.rotation.z = a;
      this.group.add(fin);
    }

    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 64; hpCanvas.height = 6;
    this._hpCtx = hpCanvas.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(hpCanvas);
    this._hpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.12),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpMesh.position.y = 0.55;
    this.group.add(this._hpMesh);
    this._redrawHP();
  }

  _redrawHP() {
    const ctx = this._hpCtx;
    ctx.clearRect(0, 0, 64, 6);
    ctx.fillStyle = '#330000'; ctx.fillRect(0, 0, 64, 6);
    ctx.fillStyle = '#ff3300'; ctx.fillRect(0, 0, 64 * Math.max(0, this.hp / this.maxHp), 6);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._hitFlash = 0.06;
    this._redrawHP();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, targetPos, camera) {
    if (this.dead) return { dist: Infinity };
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    this._exhaust.material.opacity = 0.75 + Math.sin(Date.now() * 0.025) * 0.15;

    const toTarget = new THREE.Vector3().subVectors(targetPos, this.group.position);
    const dist     = toTarget.length();
    this._dir.lerp(toTarget.normalize(), 0.06).normalize();
    this.group.position.addScaledVector(this._dir, this.speed * dt);
    this.group.lookAt(this.group.position.clone().add(this._dir));
    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    return { dist };
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss3Part (shoulder / neck hitbox indicator) ─────────────────
export class Boss3Part {
  constructor(scene, worldPos, hp, kind, hitSize) {
    this.hp     = hp;
    this.maxHp  = hp;
    this.dead   = false;
    this.kind   = kind;       // 'shoulder' | 'neck'
    this.spec   = { size: hitSize };
    this._scene = scene;
    this._hitFlash  = 0;
    this._animTimer = 0;

    this.group = new THREE.Group();
    this.group.position.copy(worldPos);
    scene.add(this.group);
    this._buildVisual(kind, hitSize);
  }

  _buildVisual(kind, size) {
    const isPrimary = kind === 'neck';
    const ringCol   = isPrimary ? 0x00ffcc : 0xffaa00;
    const ringCol2  = isPrimary ? 0x00ddaa : 0xdd8800;

    // Outer target ring — spins to draw the eye
    this._ring = new THREE.Mesh(
      new THREE.TorusGeometry(size * 1.0, size * 0.07, 8, 32),
      new THREE.MeshBasicMaterial({ color: ringCol })
    );
    this._ring.rotation.x = Math.PI / 2;
    this.group.add(this._ring);

    // Second ring at perpendicular angle
    this._ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(size * 1.0, size * 0.05, 6, 24),
      new THREE.MeshBasicMaterial({ color: ringCol2, transparent: true, opacity: 0.7 })
    );
    this.group.add(this._ring2);

    // HP bar above the target
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 128; hpCanvas.height = 12;
    this._hpCtx = hpCanvas.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(hpCanvas);
    this._hpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 2.4, size * 0.22),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpMesh.position.y = size * 1.6;
    this.group.add(this._hpMesh);
    this._redrawHP();
  }

  _redrawHP() {
    const ctx = this._hpCtx;
    ctx.clearRect(0, 0, 128, 12);
    ctx.fillStyle = '#001400'; ctx.fillRect(0, 0, 128, 12);
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = this.kind === 'neck' ? '#00ffcc' : '#ffaa00';
    ctx.fillRect(0, 0, 128 * pct, 12);
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 127, 11);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._hitFlash = 0.08;
    this._redrawHP();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, camera) {
    if (this.dead) return;
    this._animTimer += dt;
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    this._ring.rotation.y  += dt * 1.8;
    this._ring2.rotation.x += dt * 1.4;
    this._ring.material.color.setHex(this._hitFlash > 0 ? 0xffffff : (this.kind === 'neck' ? 0x00ffcc : 0xffaa00));
    if (camera) this._hpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss 3 ─────────────────────────────────────────────────────
export class Boss3 {
  constructor(scene) {
    this._scene = scene;
    this.dead   = false;
    this.kind   = 'boss';
    this.points = 20000;
    this.phase  = 1;

    // Phase 3 head state
    this.hp    = 60;
    this.maxHp = 60;
    this.spec  = { size: 2.5 };

    // Phase 3 shields
    this.shields      = [];
    this._vulnerable      = false;
    this._vulnerableTimer = 0;
    this._vulnerableDur   = 7.0;
    this._hitFlash        = 0;

    // Phase 3 movement (Boss1-style hover-and-zip)
    this._spots      = shuffle([...HEAD_SPOTS]);
    this._spotIdx    = 0;
    this._moveState  = 'hovering';
    this._hoverTimer = 0;
    this._hoverDur   = 4.0;
    this._zipSpeed   = 75;
    this._zipTarget  = null;

    // Shooting
    this._shotSide        = 0;     // 0=left, 1=right for phase 1 alternating
    this._missileTimer    = 2.5;
    this._missileInterval = 3.0;   // phase 1 base interval
    this._canFireLeft     = true;
    this._canFireRight    = true;

    this._animTimer = 0;

    // Main group — doubles as head entity in phase 3
    this.group = new THREE.Group();
    scene.add(this.group);

    // Parts array (populated by _buildParts, updated by phase transitions)
    this.parts = [];

    this._buildRobot(scene);
    this._buildParts(scene);
    this._buildPhase3HPBar();
  }

  // ── Robot body ───────────────────────────────────────────────
  _buildRobot(scene) {
    this._robotGroup = new THREE.Group();
    this._robotGroup.position.set(RX, RY, RZ);
    scene.add(this._robotGroup);

    const dark   = new THREE.MeshLambertMaterial({ color: 0x161626 });
    const mid    = new THREE.MeshLambertMaterial({ color: 0x252540 });
    const joint  = new THREE.MeshLambertMaterial({ color: 0x0a0a18 });
    const redAcc = new THREE.MeshLambertMaterial({ color: 0xff2200 });

    // ── Legs ────────────────────────────────────────────────
    for (const sx of [-4.5, 4.5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.5, 14, 8), dark);
      leg.position.set(sx, 5, 0);
      this._robotGroup.add(leg);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), mid);
      knee.position.set(sx, 12, 0);
      this._robotGroup.add(knee);
    }

    // ── Torso ────────────────────────────────────────────────
    const torso = new THREE.Mesh(new THREE.BoxGeometry(15, 14, 9), dark);
    torso.position.set(0, 20, 0);
    this._robotGroup.add(torso);

    // Chest panel + glowing core
    const chest = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 0.5), mid);
    chest.position.set(0, 20, 4.75);
    this._robotGroup.add(chest);

    this._coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3300 })
    );
    this._coreGlow.position.set(0, 21, 5.2);
    this._robotGroup.add(this._coreGlow);

    for (const sx of [-5.5, 5.5]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 0.5), redAcc);
      vent.position.set(sx, 19, 4.8);
      this._robotGroup.add(vent);
    }

    // ── Neck ────────────────────────────────────────────────
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.8, 4, 8), joint);
    neck.position.set(0, 29, 0);
    this._robotGroup.add(neck);

    // ── Head ────────────────────────────────────────────────
    this._headGroup = new THREE.Group();
    this._headGroup.position.set(0, 33, 0);
    this._robotGroup.add(this._headGroup);

    const headBody = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 9), dark);
    this._headGroup.add(headBody);

    const forehead = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.5), mid);
    forehead.position.set(0, 3.8, 4.75);
    this._headGroup.add(forehead);

    // Eyes
    this._eyes = [];
    for (const ex of [-2.5, 2.5]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5500 })
      );
      eye.position.set(ex, 0.5, 4.75);
      this._headGroup.add(eye);
      this._eyes.push(eye);
    }

    // Mouth slit
    this._mouth = new THREE.Mesh(
      new THREE.BoxGeometry(5, 1.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this._mouth.position.set(0, -2.5, 4.75);
    this._headGroup.add(this._mouth);

    // Phase 3 shield dome (on head)
    this._shieldDome = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x00ddcc, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this._shieldDome.visible = false;
    this._headGroup.add(this._shieldDome);

    // ── Arms (removable groups) ──────────────────────────────
    this._leftArmGroup  = this._buildArm(-1);
    this._rightArmGroup = this._buildArm( 1);
    this._robotGroup.add(this._leftArmGroup);
    this._robotGroup.add(this._rightArmGroup);

    // Hand firing positions in world space (robot is static in phases 1&2)
    this._leftHandPos  = new THREE.Vector3(RX - 13, RY + 6,  RZ);
    this._rightHandPos = new THREE.Vector3(RX + 13, RY + 6,  RZ);
    // Mouth position: headGroup.y=33, mouth local y=-2.5, local z=4.75
    this._mouthPos = new THREE.Vector3(RX, RY + 30.5, RZ + 4.75);
  }

  _buildArm(side) {
    const dark  = new THREE.MeshLambertMaterial({ color: 0x161626 });
    const joint = new THREE.MeshLambertMaterial({ color: 0x0a0a18 });
    const g     = new THREE.Group();
    const x     = side * 9.5;

    // Shoulder sphere (visual cap)
    g.add(Object.assign(
      new THREE.Mesh(new THREE.SphereGeometry(3.0, 10, 8), dark),
      { position: new THREE.Vector3(x, 27, 0) }
    ));

    // Upper arm
    const ua = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.0, 13, 7), dark);
    ua.position.set(side * 11.5, 20, 0);
    g.add(ua);

    // Elbow
    const el = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), joint);
    el.position.set(side * 11.5, 14, 0);
    g.add(el);

    // Forearm
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 9, 6), dark);
    fa.position.set(side * 11.5, 8.5, 0);
    g.add(fa);

    // Fist
    const fist = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.5, 3.5), dark);
    fist.position.set(side * 11.5, 4, 0);
    g.add(fist);

    // Gun barrel on fist
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 3.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x0a0a14 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(side * 11.5, 4, -2.8);
    g.add(barrel);

    return g;
  }

  _buildParts(scene) {
    const lPos = new THREE.Vector3(RX - 11.5, RY + 27, RZ);
    const rPos = new THREE.Vector3(RX + 11.5, RY + 27, RZ);
    this.leftShoulder  = new Boss3Part(scene, lPos, 60, 'shoulder', 2.8);
    this.rightShoulder = new Boss3Part(scene, rPos, 60, 'shoulder', 2.8);
    this.neck          = null;
    this.parts = [this.leftShoulder, this.rightShoulder];
  }

  _buildPhase3HPBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 22;
    this._p3HpCtx = canvas.getContext('2d');
    this._p3HpTex = new THREE.CanvasTexture(canvas);
    this._p3HpMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 0.46),
      new THREE.MeshBasicMaterial({ map: this._p3HpTex, transparent: true, depthTest: false })
    );
    this._p3HpMesh.position.y = 3.8;
    this._p3HpMesh.visible = false;
    this.group.add(this._p3HpMesh);
    this._redrawP3HP();
  }

  _redrawP3HP() {
    const ctx = this._p3HpCtx, W = 256, H = 22;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a0010'; ctx.fillRect(0, 0, W, H);
    const pct  = Math.max(0, this.hp / this.maxHp);
    const grad = ctx.createLinearGradient(0, 0, (W - 4) * pct, 0);
    grad.addColorStop(0, '#ff4422');
    grad.addColorStop(1, '#880011');
    ctx.fillStyle = grad;
    ctx.fillRect(2, 2, (W - 4) * pct, H - 4);
    ctx.strokeStyle = '#ff2200'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    this._p3HpTex.needsUpdate = true;
  }

  // Used by game.js desktop HP bar
  getHpFraction() {
    if (this.phase === 1) {
      const hp  = (this.leftShoulder?.dead  ? 0 : (this.leftShoulder?.hp  ?? 0)) +
                  (this.rightShoulder?.dead ? 0 : (this.rightShoulder?.hp ?? 0));
      const max = (this.leftShoulder?.dead  ? 0 : (this.leftShoulder?.maxHp  ?? 0)) +
                  (this.rightShoulder?.dead ? 0 : (this.rightShoulder?.maxHp ?? 0));
      return max > 0 ? hp / max : 0;
    }
    if (this.phase === 2) return (this.neck?.hp ?? 0) / (this.neck?.maxHp ?? 1);
    return this.hp / this.maxHp;
  }

  // ── Part destruction ─────────────────────────────────────────
  onPartDestroyed(part) {
    if (part.kind === 'shoulder') this._onShoulderDestroyed(part);
    else if (part.kind === 'neck') this._onNeckDestroyed();
  }

  _onShoulderDestroyed(shoulder) {
    if (shoulder === this.leftShoulder) {
      this._canFireLeft = false;
      this._robotGroup.remove(this._leftArmGroup);
    } else {
      this._canFireRight = false;
      this._robotGroup.remove(this._rightArmGroup);
    }
    this.parts = this.parts.filter(p => !p.dead);
    if (this.leftShoulder.dead && this.rightShoulder.dead) this._enterPhase2();
  }

  _enterPhase2() {
    this.phase = 2;
    const neckPos = new THREE.Vector3(RX, RY + 29, RZ);
    this.neck  = new Boss3Part(this._scene, neckPos, 80, 'neck', 2.2);
    this.parts = [this.neck];
    // 3-rocket volleys from mouth, slightly slower rate
    this._missileInterval = 4.0;
    this._missileTimer    = 2.0;
  }

  _onNeckDestroyed() {
    this.phase = 3;
    this.parts = [];

    // Detach head from robot and attach it to boss.group
    this._robotGroup.remove(this._headGroup);
    this.group.add(this._headGroup);
    this._headGroup.position.set(0, 0, 0);

    // Place boss.group where the head was in world space
    this.group.position.set(RX, RY + 33, RZ);

    // Hide robot body
    this._scene.remove(this._robotGroup);

    // Phase 3 movement setup
    this._spots      = shuffle([...HEAD_SPOTS]);
    this._spotIdx    = 0;
    this._moveState  = 'hovering';
    this._hoverTimer = 0;

    // Two shield orbs orbiting the head
    this.shields = [
      new ShieldOrb(this._scene, 0, 2),
      new ShieldOrb(this._scene, 1, 2),
    ];

    this._p3HpMesh.visible = true;
    this._missileInterval  = 2.5;
    this._missileTimer     = 1.5;
  }

  // ── Hit (phase 3 head only when vulnerable) ──────────────────
  hit(damage = 1) {
    if (this.phase !== 3 || !this._vulnerable) return false;
    this.hp -= damage;
    this._hitFlash = 0.10;
    this._redrawP3HP();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  // ── Main update ──────────────────────────────────────────────
  update(dt, playerPos, scene, camera) {
    if (this.dead) return [];
    this._animTimer += dt;

    // Core glow (phases 1 & 2)
    if (this._coreGlow && this.phase < 3) {
      this._coreGlow.material.color.setHSL(0.0, 1.0, 0.42 + 0.12 * Math.sin(this._animTimer * 4));
    }
    // Eyes base animation (phases 1 & 2; phase 3 overrides below)
    if (this.phase < 3) {
      for (const eye of this._eyes) {
        eye.material.color.setHSL(0.05, 1.0, 0.38 + 0.15 * Math.sin(this._animTimer * 3 + eye.position.x));
      }
    }

    // Update part spinning rings
    for (const p of this.parts) p.update(dt, camera);

    switch (this.phase) {
      case 1: return this._updatePhase1(dt, playerPos, scene);
      case 2: return this._updatePhase2(dt, playerPos, scene);
      case 3: return this._updatePhase3(dt, playerPos, scene, camera);
    }
    return [];
  }

  _updatePhase1(dt, playerPos, scene) {
    const rockets = [];
    this._missileTimer -= dt;
    if (this._missileTimer <= 0) {
      this._missileTimer = this._missileInterval;
      let pos = null;
      if (this._canFireLeft && this._canFireRight) {
        pos = this._shotSide === 0 ? this._leftHandPos : this._rightHandPos;
        this._shotSide ^= 1;
      } else if (this._canFireLeft) {
        pos = this._leftHandPos;
      } else if (this._canFireRight) {
        pos = this._rightHandPos;
      }
      if (pos) rockets.push(new Boss3Rocket(pos.clone(), playerPos.clone(), scene));
    }
    return rockets;
  }

  _updatePhase2(dt, playerPos, scene) {
    const rockets = [];
    this._missileTimer -= dt;
    if (this._missileTimer <= 0) {
      this._missileTimer = this._missileInterval;
      // 3-rocket spread from mouth
      for (let i = -1; i <= 1; i++) {
        const target = playerPos.clone().add(new THREE.Vector3(i * 3, 0, 0));
        rockets.push(new Boss3Rocket(this._mouthPos.clone(), target, scene));
      }
    }
    return rockets;
  }

  _updatePhase3(dt, playerPos, scene, camera) {
    const rockets = [];

    // ── Hover-and-zip movement ───────────────────────────────
    if (this._moveState === 'hovering') {
      this._hoverTimer += dt;
      if (this._hoverTimer >= this._hoverDur) {
        this._hoverTimer = 0;
        this._moveState  = 'zipping';
        this._spotIdx    = (this._spotIdx + 1) % this._spots.length;
        this._zipTarget  = this._spots[this._spotIdx].clone();
      }
    } else {
      const toTarget = new THREE.Vector3().subVectors(this._zipTarget, this.group.position);
      const dist = toTarget.length();
      if (dist < 0.5) {
        this._moveState = 'hovering'; this._hoverTimer = 0;
        this.group.position.copy(this._zipTarget);
      } else {
        this.group.position.addScaledVector(toTarget.normalize(), Math.min(this._zipSpeed * dt, dist));
      }
    }

    // Face player
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.group.position);
    this.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    // ── Shields ──────────────────────────────────────────────
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
    for (const s of this.shields) s.update(dt, this.group.position, camera);

    // Shield dome on head
    this._shieldDome.visible = !allShieldsDown && !this._vulnerable;

    // ── Eye animation ────────────────────────────────────────
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      for (const eye of this._eyes) eye.material.color.setHex(0xffffff);
    } else if (this._vulnerable) {
      const p = 0.5 + 0.5 * Math.sin(this._animTimer * 9);
      for (const eye of this._eyes) eye.material.color.setHSL(0.08, 1.0, 0.5 + p * 0.25);
    } else {
      for (const eye of this._eyes) eye.material.color.setHex(0xff5500);
    }

    // ── Missiles (only while hovering) ───────────────────────
    if (this._moveState === 'hovering') {
      this._missileTimer -= dt;
      if (this._missileTimer <= 0) {
        this._missileTimer = this._missileInterval;
        const toP2D = new THREE.Vector3(
          playerPos.x - this.group.position.x, 0,
          playerPos.z - this.group.position.z
        ).normalize();
        const mouthWorld = this.group.position.clone()
          .addScaledVector(toP2D, 4.0)
          .add(new THREE.Vector3(0, -1.5, 0));
        rockets.push(new Boss3Rocket(mouthWorld, playerPos.clone(), scene));
      }
    }

    if (camera) this._p3HpMesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    return rockets;
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this._robotGroup);
    this._scene.remove(this.group);
    this.leftShoulder?.destroy();
    this.rightShoulder?.destroy();
    this.neck?.destroy();
    for (const s of this.shields) s.destroy();
  }
}
