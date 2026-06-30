import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { ShieldOrb } from './boss.js';

// Robot stands here — far back, centred on the arena
const RX = 0, RY = 0, RZ = -72;

// How far underground the robot starts its rise animation
const RISE_DEPTH = 65;

// Hover spots for phase-3 head (inside normal combat zone)
const HEAD_SPOTS = [
  new THREE.Vector3(  0, 14, -30),
  new THREE.Vector3(-16, 11, -24),
  new THREE.Vector3( 16, 11, -24),
  new THREE.Vector3( -8, 16, -42),
  new THREE.Vector3(  8, 16, -42),
  new THREE.Vector3(  0, 10, -20),
  new THREE.Vector3(-14, 13, -34),
  new THREE.Vector3( 14, 13, -34),
];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Material helpers ────────────────────────────────────────────
const mkLambert = (hex) => new THREE.MeshLambertMaterial({ color: hex });
const mkBasic   = (hex) => new THREE.MeshBasicMaterial({ color: hex });
const mkMesh    = (geo, mat) => new THREE.Mesh(geo, mat);

// ── Boss3Rocket ──────────────────────────────────────────────────
export class Boss3Rocket {
  constructor(fromPos, targetPos, scene) {
    this.hp     = 10;
    this.maxHp  = 10;
    this.dead   = false;
    this.kind   = 'missile';
    this.damage = 35;
    this.spec   = { size: 0.70 };
    this._scene = scene;
    this._speed = 12;
    this._hitFlash = 0;

    const dir = new THREE.Vector3().subVectors(targetPos, fromPos).normalize();
    this._dir = dir.clone();

    this.group = new THREE.Group();
    this.group.position.copy(fromPos);
    this.group.lookAt(fromPos.clone().add(dir));
    this._build();
    scene.add(this.group);
  }

  _build() {
    const body = mkMesh(new THREE.CylinderGeometry(0.25, 0.25, 2.0, 7), mkLambert(0x1a0840));
    body.rotation.x = Math.PI / 2;
    this.group.add(body);

    const nose = mkMesh(new THREE.ConeGeometry(0.25, 0.9, 7), mkBasic(0xcc44ff));
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.45;
    this.group.add(nose);

    this._exhaust = mkMesh(
      new THREE.SphereGeometry(0.32, 7, 4),
      new THREE.MeshBasicMaterial({ color: 0xaa22ee, transparent: true, opacity: 0.88 })
    );
    this._exhaust.position.z = 1.1;
    this.group.add(this._exhaust);

    for (let i = 0; i < 4; i++) {
      const a   = (i / 4) * Math.PI * 2;
      const fin = mkMesh(
        new THREE.PlaneGeometry(0.4, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x9933ee, side: THREE.DoubleSide })
      );
      fin.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 1.0);
      fin.rotation.z = a;
      this.group.add(fin);
    }

    const c = document.createElement('canvas');
    c.width = 64; c.height = 6;
    this._hpCtx = c.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(c);
    this._hpBar = mkMesh(
      new THREE.PlaneGeometry(1.2, 0.14),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpBar.position.y = 0.6;
    this.group.add(this._hpBar);
    this._redrawHP();
  }

  _redrawHP() {
    const ctx = this._hpCtx;
    ctx.clearRect(0, 0, 64, 6);
    ctx.fillStyle = '#0a0020'; ctx.fillRect(0, 0, 64, 6);
    ctx.fillStyle = '#cc44ff'; ctx.fillRect(0, 0, 64 * Math.max(0, this.hp / this.maxHp), 6);
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
    this._exhaust.material.opacity = 0.7 + Math.sin(Date.now() * 0.03) * 0.18;

    const toTarget = new THREE.Vector3().subVectors(targetPos, this.group.position);
    const dist     = toTarget.length();
    this._dir.lerp(toTarget.normalize(), 0.065).normalize();
    this.group.position.addScaledVector(this._dir, this._speed * dt);
    this.group.lookAt(this.group.position.clone().add(this._dir));

    if (camera) {
      const camPos = new THREE.Vector3();
      camera.getWorldPosition(camPos);
      this._hpBar.lookAt(camPos);
    }
    return { dist };
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss3Part — target-ring hitbox indicator ─────────────────────
export class Boss3Part {
  constructor(scene, worldPos, hp, kind, hitSize) {
    this.hp     = hp;
    this.maxHp  = hp;
    this.dead   = false;
    this.kind   = kind;
    this.spec   = { size: hitSize };
    this._scene = scene;
    this._hitFlash  = 0;
    this._animTimer = 0;

    this.group = new THREE.Group();
    this.group.position.copy(worldPos);
    scene.add(this.group);
    this._build(hitSize);
  }

  _build(size) {
    const isNeck = this.kind === 'neck';
    // Shoulders: bright orange-yellow  |  Neck: bright cyan — both contrast against purple body
    const col1   = isNeck ? 0x00ffdd : 0xffaa00;
    const col2   = isNeck ? 0x00cc99 : 0xff7700;

    // Large outer spinning ring (horizontal — lies in XZ plane)
    this._ring = mkMesh(
      new THREE.TorusGeometry(size * 1.25, size * 0.11, 10, 36),
      mkBasic(col1)
    );
    this._ring.rotation.x = Math.PI / 2;
    this.group.add(this._ring);

    // Medium ring perpendicular (vertical — lies in XY plane)
    this._ring2 = mkMesh(
      new THREE.TorusGeometry(size * 0.85, size * 0.07, 8, 28),
      new THREE.MeshBasicMaterial({ color: col2, transparent: true, opacity: 0.85 })
    );
    this.group.add(this._ring2);

    // Third ring diagonal for full 3-axis coverage
    this._ring3 = mkMesh(
      new THREE.TorusGeometry(size * 1.0, size * 0.05, 6, 24),
      new THREE.MeshBasicMaterial({ color: col2, transparent: true, opacity: 0.60 })
    );
    this._ring3.rotation.z = Math.PI / 2;
    this.group.add(this._ring3);

    // 4 inward-pointing arrow cones in XZ plane (horizontal)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const arrow = mkMesh(new THREE.ConeGeometry(size * 0.14, size * 0.55, 5), mkBasic(col1));
      // Rotate ConeGeometry (+Y tip) to point toward center
      arrow.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle))
      );
      arrow.position.set(Math.cos(angle) * size * 1.75, 0, Math.sin(angle) * size * 1.75);
      this.group.add(arrow);
    }

    // PointLight to illuminate the hit area so it stands out at night
    this._partLight = new THREE.PointLight(col1, 8, size * 9);
    this._partLight.position.set(0, 2, 0);
    this.group.add(this._partLight);

    // HP bar
    const c = document.createElement('canvas');
    c.width = 128; c.height = 14;
    this._hpCtx = c.getContext('2d');
    this._hpTex = new THREE.CanvasTexture(c);
    this._hpBar = mkMesh(
      new THREE.PlaneGeometry(size * 2.8, size * 0.26),
      new THREE.MeshBasicMaterial({ map: this._hpTex, transparent: true, depthTest: false })
    );
    this._hpBar.position.y = size * 2.0;
    this.group.add(this._hpBar);
    this._redrawHP();
  }

  _redrawHP() {
    const isNeck = this.kind === 'neck';
    const ctx    = this._hpCtx;
    ctx.clearRect(0, 0, 128, 14);
    ctx.fillStyle = '#001a0a'; ctx.fillRect(0, 0, 128, 14);
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = isNeck ? '#00ffdd' : '#ffaa00';
    ctx.fillRect(0, 0, 128 * pct, 14);
    ctx.strokeStyle = isNeck ? '#00aa88' : '#cc7700';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 127, 13);
    this._hpTex.needsUpdate = true;
  }

  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._hitFlash = 0.09;
    this._redrawHP();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  update(dt, camera) {
    if (this.dead) return;
    this._animTimer += dt;
    this._hitFlash = Math.max(0, this._hitFlash - dt);

    const speed = this._hitFlash > 0 ? 5.0 : 2.0;
    this._ring.rotation.y  += dt * speed;
    this._ring2.rotation.x += dt * (speed * 0.75);
    this._ring3.rotation.y -= dt * (speed * 0.5);

    const col = this._hitFlash > 0 ? 0xffffff : (this.kind === 'neck' ? 0x00ffdd : 0xffaa00);
    this._ring.material.color.setHex(col);

    // Pulse the part light
    this._partLight.intensity = 6 + 4 * Math.sin(this._animTimer * 4);

    if (camera) {
      const p = new THREE.Vector3();
      camera.getWorldPosition(p);
      this._hpBar.lookAt(p);
    }
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }
}

// ── Boss 3 — Giant Purple Robot ──────────────────────────────────
export class Boss3 {
  constructor(scene) {
    this._scene = scene;
    this.dead   = false;
    this.kind   = 'boss';
    this.points = 20000;
    this.phase  = 1;

    // Phase-3 head HP
    this.hp    = 60;
    this.maxHp = 60;
    this.spec  = { size: 2.8 };

    // Phase-3 shields (timer-based respawn — final boss is tough)
    this.shields          = [];
    this._vulnerable      = false;
    this._vulnerableTimer = 0;
    this._vulnerableDur   = 6.0;
    this._hitFlash        = 0;

    // Phase-3 hover-and-zip movement
    this._spots      = shuffled(HEAD_SPOTS);
    this._spotIdx    = 0;
    this._moveState  = 'hovering';
    this._hoverTimer = 0;
    this._hoverDur   = 3.5;
    this._zipTarget  = null;
    this._zipSpeed   = 70;

    // Firing state (shared across phases)
    this._canFireLeft     = true;
    this._canFireRight    = true;
    this._shotSide        = 0;
    this._missileTimer    = 2.5;
    this._missileInterval = 3.25; // phase 1 base (-30% from original 2.5)

    this._animTimer = 0;

    // Rise-from-ground animation state
    this._rising     = true;
    this._riseT      = 0;
    this._riseDur    = 4.2; // seconds to fully emerge
    this._riseOffset = -RISE_DEPTH; // current y-offset vs. final rest position

    // boss.group doubles as the head entity in phase 3
    this.group = new THREE.Group();
    scene.add(this.group);

    // Hittable parts (changes per phase)
    this.parts = [];

    this._buildRobot(scene);
    this._buildParts(scene);
    this._buildP3Bar();
  }

  // ── Construction ─────────────────────────────────────────────

  _buildRobot(scene) {
    this._robotGroup = new THREE.Group();
    // Start underground; rise animation moves it to (RX, RY, RZ)
    this._robotGroup.position.set(RX, RY - RISE_DEPTH, RZ);
    scene.add(this._robotGroup);

    const body  = mkLambert(0x6622aa);  // dark purple
    const dark  = mkLambert(0x2a0a55);  // dark purple panel
    const joint = mkLambert(0x180840);  // deep purple-black

    // Legs
    for (const sx of [-5.5, 5.5]) {
      const leg = mkMesh(new THREE.BoxGeometry(5, 14, 5), body);
      leg.position.set(sx, 5, 0);
      this._robotGroup.add(leg);

      const kpad = mkMesh(new THREE.BoxGeometry(6.5, 3, 6.5), dark);
      kpad.position.set(sx, 10, 2.5);
      this._robotGroup.add(kpad);

      const ankle = mkMesh(new THREE.BoxGeometry(4.5, 1, 4.5), mkBasic(0xcc44ff));
      ankle.position.set(sx, -1.5, 0);
      this._robotGroup.add(ankle);
    }

    // Torso
    const torso = mkMesh(new THREE.BoxGeometry(15, 16, 10), body);
    torso.position.set(0, 22, 0);
    this._robotGroup.add(torso);

    const chest = mkMesh(new THREE.BoxGeometry(9, 9, 1.2), dark);
    chest.position.set(0, 22, 5.6);
    this._robotGroup.add(chest);

    // Pulsing core — octahedron (matches drone aesthetic)
    this._coreGlow = mkMesh(new THREE.OctahedronGeometry(2.2, 0), mkBasic(0xcc00ff));
    this._coreGlow.position.set(0, 22, 6.2);
    this._robotGroup.add(this._coreGlow);

    for (const sx of [-6, 6]) {
      const vent = mkMesh(new THREE.BoxGeometry(1.8, 6, 0.8), mkBasic(0xaa33dd));
      vent.position.set(sx, 22, 5.8);
      this._robotGroup.add(vent);
    }

    // Shoulder blocks (visual caps above arms)
    for (const sx of [-10, 10]) {
      const sb = mkMesh(new THREE.BoxGeometry(6, 6, 7), body);
      sb.position.set(sx, 30, 0);
      this._robotGroup.add(sb);

      const sp = mkMesh(new THREE.BoxGeometry(7, 1.2, 7.5), mkBasic(0xcc44ff));
      sp.position.set(sx, 33.5, 0);
      this._robotGroup.add(sp);
    }

    // Neck cylinder
    const nk = mkMesh(new THREE.CylinderGeometry(2.2, 3, 5, 8), joint);
    nk.position.set(0, 37, 0);
    this._robotGroup.add(nk);

    // Head group (detaches in phase 3)
    this._headGroup = new THREE.Group();
    this._headGroup.position.set(0, 42, 0);
    this._robotGroup.add(this._headGroup);

    // Head — large octahedron matches Boss-1 DNA
    const head = mkMesh(new THREE.OctahedronGeometry(5.5, 1), mkLambert(0x6622aa));
    this._headGroup.add(head);

    // Eyes — magenta glow like Boss 2
    this._eyes = [];
    for (const ex of [-2.2, 2.2]) {
      const eye = mkMesh(new THREE.SphereGeometry(1.1, 8, 6), mkBasic(0xff44ff));
      eye.position.set(ex, 0.5, 5.0);
      this._headGroup.add(eye);
      this._eyes.push(eye);
    }

    // Mouth emitter glow
    this._mouth = mkMesh(new THREE.BoxGeometry(4.5, 1.4, 0.6), mkBasic(0xcc00ff));
    this._mouth.position.set(0, -2.2, 5.1);
    this._headGroup.add(this._mouth);

    // Phase-3 turquoise shield dome (transferred with headGroup)
    this._shieldDome = mkMesh(
      new THREE.SphereGeometry(6.5, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x00ddcc, transparent: true, opacity: 0.15,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    this._shieldDome.visible = false;
    this._headGroup.add(this._shieldDome);

    // Head light follows head into phase 3
    const hl = new THREE.PointLight(0xcc66ff, 12, 28);
    hl.position.set(0, 2, 0);
    this._headGroup.add(hl);

    // Arms
    this._leftArmGroup  = this._buildArm(-1, body, dark, joint);
    this._rightArmGroup = this._buildArm( 1, body, dark, joint);
    this._robotGroup.add(this._leftArmGroup);
    this._robotGroup.add(this._rightArmGroup);

    // Firing positions in world space (robot final rest position)
    this._leftHandPos  = new THREE.Vector3(RX - 12, RY + 4,    RZ + 10);
    this._rightHandPos = new THREE.Vector3(RX + 12, RY + 4,    RZ + 10);
    this._mouthPos     = new THREE.Vector3(RX,      RY + 39.8, RZ + 5.1);

    // Multiple PointLights to illuminate the giant body at night
    const lightDefs = [
      [0xdd88ff, 16, 70, -14, 32, 14],
      [0xdd88ff, 16, 70,  14, 32, 14],
      [0xcc66ff, 12, 60,   0, 12, 16],
      [0xffffff,  8, 80,   0, 55,  0],
      [0xaa44ff, 10, 55,   0,  0, 16],
    ];
    for (const [color, intensity, dist, x, y, z] of lightDefs) {
      const light = new THREE.PointLight(color, intensity, dist);
      light.position.set(x, y, z);
      this._robotGroup.add(light);
    }
  }

  _buildArm(side, bodyMat, darkMat, jointMat) {
    const g  = new THREE.Group();
    const sx = side * 12;

    const ua = mkMesh(new THREE.BoxGeometry(4.5, 12, 4.5), bodyMat);
    ua.position.set(sx, 23, 0);
    g.add(ua);

    const elbow = mkMesh(new THREE.SphereGeometry(2.8, 8, 6), jointMat);
    elbow.position.set(sx, 16, 0);
    g.add(elbow);

    const fa = mkMesh(new THREE.BoxGeometry(4, 9, 4), darkMat);
    fa.position.set(sx, 9.5, 0);
    g.add(fa);

    const fist = mkMesh(new THREE.BoxGeometry(5.5, 5.5, 7), bodyMat);
    fist.position.set(sx, 4, 2.5);
    g.add(fist);

    // Barrel pointing toward player (+Z direction)
    const barrel = mkMesh(new THREE.CylinderGeometry(0.65, 0.65, 6, 6), mkLambert(0x0a0820));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(sx, 4, 7.0);
    g.add(barrel);

    const muzzle = mkMesh(new THREE.SphereGeometry(0.9, 7, 5), mkBasic(0xcc44ff));
    muzzle.position.set(sx, 4, 10.2);
    g.add(muzzle);

    const strip = mkMesh(new THREE.BoxGeometry(5.6, 0.8, 7.2), mkBasic(0xbb33ff));
    strip.position.set(sx, 7.1, 2.5);
    g.add(strip);

    return g;
  }

  _buildParts(scene) {
    // Parts start underground to match the robot's rise start position
    const lPos = new THREE.Vector3(RX - 12, RY + 27 - RISE_DEPTH, RZ);
    const rPos = new THREE.Vector3(RX + 12, RY + 27 - RISE_DEPTH, RZ);
    this.leftShoulder  = new Boss3Part(scene, lPos, 60, 'shoulder', 3.0);
    this.rightShoulder = new Boss3Part(scene, rPos, 60, 'shoulder', 3.0);
    this.neck          = null;
    this.parts = [this.leftShoulder, this.rightShoulder];
  }

  _buildP3Bar() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 22;
    this._p3Ctx = c.getContext('2d');
    this._p3Tex = new THREE.CanvasTexture(c);
    this._p3Bar = mkMesh(
      new THREE.PlaneGeometry(6, 0.52),
      new THREE.MeshBasicMaterial({ map: this._p3Tex, transparent: true, depthTest: false })
    );
    this._p3Bar.position.y = 4.2;
    this._p3Bar.visible = false;
    this.group.add(this._p3Bar);
    this._redrawP3();
  }

  _redrawP3() {
    const ctx = this._p3Ctx, W = 256, H = 22;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0025'; ctx.fillRect(0, 0, W, H);
    const pct = Math.max(0, this.hp / this.maxHp);
    const gr  = ctx.createLinearGradient(0, 0, (W - 4) * pct, 0);
    gr.addColorStop(0, '#cc44ff'); gr.addColorStop(1, '#6600aa');
    ctx.fillStyle = gr; ctx.fillRect(2, 2, (W - 4) * pct, H - 4);
    ctx.strokeStyle = '#aa44ee'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    this._p3Tex.needsUpdate = true;
  }

  // Desktop HP bar
  getHpFraction() {
    if (this.phase === 1) {
      const hp = (this.leftShoulder?.dead  ? 0 : (this.leftShoulder?.hp  ?? 0)) +
                 (this.rightShoulder?.dead ? 0 : (this.rightShoulder?.hp ?? 0));
      return hp / ((this.leftShoulder?.maxHp ?? 60) + (this.rightShoulder?.maxHp ?? 60));
    }
    if (this.phase === 2) return Math.max(0, (this.neck?.hp ?? 0) / (this.neck?.maxHp ?? 1));
    return Math.max(0, this.hp / this.maxHp);
  }

  // ── Part destruction ─────────────────────────────────────────

  onPartDestroyed(part) {
    if (part.kind === 'shoulder') this._onShoulderDown(part);
    else if (part.kind === 'neck') this._onNeckDown();
  }

  _onShoulderDown(shoulder) {
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
    const neckPos = new THREE.Vector3(RX, RY + 37, RZ);
    this.neck  = new Boss3Part(this._scene, neckPos, 80, 'neck', 2.5);
    this.parts = [this.neck];
    this._missileInterval = 3.8;
    this._missileTimer    = 2.0;
  }

  _onNeckDown() {
    this.phase = 3;
    this.parts = [];

    // Re-parent head group from robotGroup to boss.group
    this._robotGroup.remove(this._headGroup);
    this.group.add(this._headGroup);
    this._headGroup.position.set(0, 0, 0);

    // boss.group world position = where the head was (robot at y=0, head local y=42)
    this.group.position.set(RX, RY + 42, RZ);

    // Robot body disappears
    this._scene.remove(this._robotGroup);

    // Two shield orbs
    this.shields = [
      new ShieldOrb(this._scene, 0, 2),
      new ShieldOrb(this._scene, 1, 2),
    ];

    // Reset hover-zip
    this._spots      = shuffled(HEAD_SPOTS);
    this._spotIdx    = 0;
    this._moveState  = 'hovering';
    this._hoverTimer = 0;

    this._p3Bar.visible   = true;
    this._missileInterval = 2.2;
    this._missileTimer    = 1.5;
  }

  // ── Hit (phase-3 only when vulnerable) ───────────────────────

  hit(damage = 1) {
    if (this.phase !== 3 || !this._vulnerable) return false;
    this.hp -= damage;
    this._hitFlash = 0.10;
    this._redrawP3();
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  // ── Main update ──────────────────────────────────────────────

  update(dt, playerPos, scene, camera) {
    if (this.dead) return [];
    this._animTimer += dt;

    // ── Rise-from-ground animation ────────────────────────────
    if (this._rising) {
      this._riseT = Math.min(this._riseT + dt / this._riseDur, 1.0);
      // Cubic ease-out: fast start, slow landing
      const ease   = 1 - Math.pow(1 - this._riseT, 3);
      const newOff = -RISE_DEPTH + RISE_DEPTH * ease; // goes from -65 to 0
      const delta  = newOff - this._riseOffset;
      this._riseOffset = newOff;
      this._robotGroup.position.y += delta;
      for (const p of this.parts) p.group.position.y += delta;
      // Pulse core while rising
      if (this._coreGlow) {
        const s = 0.8 + 0.2 * Math.sin(this._animTimer * 6);
        this._coreGlow.scale.setScalar(s);
      }
      if (this._riseT >= 1.0) {
        this._rising = false;
        this._missileTimer = this._missileInterval; // reset so first shot has proper delay
      }
      return [];
    }

    // Core pulse (phases 1&2)
    if (this.phase < 3 && this._coreGlow) {
      const s = 0.85 + 0.15 * Math.sin(this._animTimer * 5);
      this._coreGlow.scale.setScalar(s);
      this._coreGlow.material.color.setHSL(0.78, 1.0, 0.38 + 0.14 * Math.sin(this._animTimer * 4));
    }

    for (const p of this.parts) p.update(dt, camera);

    switch (this.phase) {
      case 1: return this._phase1(dt, playerPos, scene);
      case 2: return this._phase2(dt, playerPos, scene);
      case 3: return this._phase3(dt, playerPos, scene, camera);
    }
    return [];
  }

  // Phase 1 — alternating fist rockets ─────────────────────────

  _phase1(dt, playerPos, scene) {
    const rockets = [];
    this._missileTimer -= dt;
    if (this._missileTimer <= 0) {
      this._missileTimer = this._missileInterval;

      let firePos = null;
      if (this._canFireLeft && this._canFireRight) {
        firePos = this._shotSide === 0 ? this._leftHandPos : this._rightHandPos;
        this._shotSide ^= 1;
      } else if (this._canFireLeft) {
        firePos = this._leftHandPos;
      } else if (this._canFireRight) {
        firePos = this._rightHandPos;
      }

      if (firePos) {
        rockets.push(new Boss3Rocket(firePos.clone(), playerPos.clone(), scene));
      }
    }
    return rockets;
  }

  // Phase 2 — 3-rocket spread from mouth ───────────────────────

  _phase2(dt, playerPos, scene) {
    const rockets = [];
    this._missileTimer -= dt;
    if (this._missileTimer <= 0) {
      this._missileTimer = this._missileInterval;
      for (let i = -1; i <= 1; i++) {
        const target = playerPos.clone().add(new THREE.Vector3(i * 3.5, 0, 0));
        rockets.push(new Boss3Rocket(this._mouthPos.clone(), target, scene));
      }
    }
    return rockets;
  }

  // Phase 3 — floating head, zip movement, shields ─────────────

  _phase3(dt, playerPos, scene, camera) {
    const rockets = [];

    // Hover-and-zip
    if (this._moveState === 'hovering') {
      this.group.position.y += Math.sin(this._animTimer * 1.8) * 0.008;
      this._hoverTimer += dt;
      if (this._hoverTimer >= this._hoverDur) {
        this._hoverTimer = 0;
        this._moveState  = 'zipping';
        this._spotIdx    = (this._spotIdx + 1) % this._spots.length;
        this._zipTarget  = this._spots[this._spotIdx].clone();
      }
    } else {
      const toTarget = new THREE.Vector3().subVectors(this._zipTarget, this.group.position);
      const dist     = toTarget.length();
      if (dist < 0.6) {
        this._moveState  = 'hovering';
        this._hoverTimer = 0;
        this.group.position.copy(this._zipTarget);
      } else {
        this.group.position.addScaledVector(toTarget.normalize(), Math.min(this._zipSpeed * dt, dist));
      }
    }

    // Face player
    const toP = new THREE.Vector3()
      .subVectors(playerPos, this.group.position)
      .setY(0).normalize();
    this.group.rotation.y = Math.atan2(toP.x, toP.z);

    // Shields
    const allDead = this.shields.every(s => s.dead);
    if (this._vulnerable) {
      this._vulnerableTimer -= dt;
      if (this._vulnerableTimer <= 0) {
        this._vulnerable = false;
        for (const s of this.shields) s.revive();
      }
    } else if (allDead) {
      this._vulnerable      = true;
      this._vulnerableTimer = this._vulnerableDur;
    }
    for (const s of this.shields) s.update(dt, this.group.position, camera);
    this._shieldDome.visible = !allDead && !this._vulnerable;

    // Eye animation
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      for (const e of this._eyes) e.material.color.setHex(0xffffff);
    } else if (this._vulnerable) {
      const p = 0.5 + 0.5 * Math.sin(this._animTimer * 9);
      for (const e of this._eyes) e.material.color.setHSL(0.82, 1.0, 0.5 + p * 0.3);
    } else {
      for (const e of this._eyes) e.material.color.setHex(0xff44ff);
    }

    // Mouth rocket — only while hovering
    if (this._moveState === 'hovering') {
      this._missileTimer -= dt;
      if (this._missileTimer <= 0) {
        this._missileTimer = this._missileInterval;
        const forward  = new THREE.Vector3(0, 0, 1).applyEuler(this.group.rotation);
        const spawnPos = this.group.position.clone()
          .addScaledVector(forward, 5.5)
          .add(new THREE.Vector3(0, -1.8, 0));
        rockets.push(new Boss3Rocket(spawnPos, playerPos.clone(), scene));
      }
    }

    if (camera) {
      const p = new THREE.Vector3();
      camera.getWorldPosition(p);
      this._p3Bar.lookAt(p);
    }
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
