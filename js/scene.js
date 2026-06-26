import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Day colour constants — vivid summer sky
const DAY_AMB_COL   = new THREE.Color(0xbbd8ff);
const DAY_FOG_COL   = new THREE.Color(0xd0eeff);
const DAY_BG_COL    = new THREE.Color(0x87ceeb);
// Night colour constants
const NIGHT_AMB_COL = new THREE.Color(0x1a083a);
const NIGHT_FOG_COL = new THREE.Color(0x080018);
const NIGHT_BG_COL  = new THREE.Color(0x0a001e);
// Evening (sunset) colour constants — vivid warm sunset
const EVE_AMB_COL   = new THREE.Color(0xff8844);
const EVE_FOG_COL   = new THREE.Color(0xe06030);
const EVE_BG_COL    = new THREE.Color(0xcc4820);

// ── Rain system ───────────────────────────────────────────────────
class RainSystem {
  constructor(scene) {
    const N   = 2000;
    const pos = new Float32Array(N * 6); // 2 verts × 3 floats per segment
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      const y = Math.random() * 38 - 3;
      pos[i*6]   = x;  pos[i*6+1] = y;       pos[i*6+2] = z;
      pos[i*6+3] = x;  pos[i*6+4] = y - 0.4; pos[i*6+5] = z;
    }
    const geo = new THREE.BufferGeometry();
    this._attr = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', this._attr);
    this._N    = N;
    this._mesh = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.28 }));
    this._mesh.visible = false;
    scene.add(this._mesh);
  }

  setVisible(v) { this._mesh.visible = v; }

  update(dt) {
    if (!this._mesh.visible) return;
    const a   = this._attr.array;
    const spd = 15 * dt;
    for (let i = 0; i < this._N; i++) {
      a[i*6+1] -= spd;
      a[i*6+4] -= spd;
      if (a[i*6+4] < -5) { a[i*6+1] += 40; a[i*6+4] += 40; }
    }
    this._attr.needsUpdate = true;
  }
}

// ── Lightning system ──────────────────────────────────────────────
class LightningSystem {
  constructor(scene) {
    this._scene    = scene;
    this._onStrike = null;
    this._timer    = 6 + Math.random() * 10; // first strike in 6-16s
    this._phase    = 'idle';
    this._phaseT   = 0;
    this._bolt     = null;
    this._bolts    = []; // branching bolts

    // Directional point light for local illumination from the bolt
    this._flashLight = new THREE.PointLight(0xddeeff, 0, 800);
    this._flashLight.position.set(0, 60, -100);
    scene.add(this._flashLight);

    // Full-scene ambient flash — mimics sky-wide illumination
    this._flashAmb = new THREE.AmbientLight(0xddeeff, 0);
    scene.add(this._flashAmb);
  }

  setOnStrike(cb) { this._onStrike = cb; }

  update(dt, nightFrac) {
    if (nightFrac <= 0) {
      this._flashLight.intensity = 0;
      this._flashAmb.intensity   = 0;
      return;
    }

    if (this._phase !== 'idle') { this._tickFlash(dt); return; }

    this._timer -= dt;
    if (this._timer <= 0) {
      this._trigger();
      this._timer = 4 + Math.random() * 18;
    }
  }

  _makeBolt(ox, oyTop, oz, jitterScale) {
    const pts   = [];
    const steps = 10 + Math.floor(Math.random() * 7);
    const yBot  = 12 + Math.random() * 20;
    let cx = ox, cz = oz;
    for (let i = 0; i <= steps; i++) {
      const tf  = i / steps;
      const jit = (i === 0 || i === steps) ? 0 : (Math.random() - 0.5) * jitterScale;
      cx += (Math.random() - 0.5) * jitterScale * 0.4;
      cz += (Math.random() - 0.5) * jitterScale * 0.15;
      pts.push(new THREE.Vector3(
        cx + jit,
        oyTop - (oyTop - yBot) * tf,
        cz,
      ));
    }
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.95 })
    );
    this._scene.add(line);
    return line;
  }

  _trigger() {
    const x    = (Math.random() - 0.5) * 180;
    const z    = -90 - Math.random() * 120;
    const yTop = 70 + Math.random() * 30;

    // Main bolt + 1-2 smaller branches
    this._bolts = [ this._makeBolt(x, yTop, z, 22) ];
    if (Math.random() > 0.4) {
      const bx = x + (Math.random() - 0.5) * 20;
      this._bolts.push(this._makeBolt(bx, yTop - 15, z + (Math.random()-0.5)*10, 14));
    }

    this._flashLight.position.set(x, yTop * 0.55, z);
    this._phase  = 'flash1';
    this._phaseT = 0;

    const dist  = Math.sqrt(x * x + z * z);
    setTimeout(() => this._onStrike?.(), (dist / 340) * 1000);
  }

  _setBoltVisible(v) { for (const b of this._bolts) b.visible = v; }

  _tickFlash(dt) {
    this._phaseT += dt;
    if (this._phase === 'flash1') {
      this._flashLight.intensity = 45;
      this._flashAmb.intensity   = 5.0;
      this._setBoltVisible(true);
      if (this._phaseT > 0.18) { this._phase = 'gap'; this._phaseT = 0; }
    } else if (this._phase === 'gap') {
      this._flashLight.intensity = 0;
      this._flashAmb.intensity   = 0;
      this._setBoltVisible(false);
      if (this._phaseT > 0.08) { this._phase = 'flash2'; this._phaseT = 0; }
    } else if (this._phase === 'flash2') {
      this._flashLight.intensity = 30;
      this._flashAmb.intensity   = 3.5;
      this._setBoltVisible(true);
      if (this._phaseT > 0.14) { this._phase = 'done'; this._phaseT = 0; }
    } else {
      this._flashLight.intensity = 0;
      this._flashAmb.intensity   = 0;
      for (const b of this._bolts) {
        this._scene.remove(b);
        b.geometry.dispose();
        b.material.dispose();
      }
      this._bolts = [];
      this._phase = 'idle';
    }
  }
}

// ── Cloud system ──────────────────────────────────────────────────
class CloudSystem {
  constructor(scene) {
    this._clouds = [];

    // [x, y, z, widthM, depthM]  — spread across the sky above the action zone
    const cloudData = [
      [-55,  58,  -85, 48, 22],
      [ 20,  64,  -98, 65, 28],
      [ 82,  52,  -72, 40, 18],
      [-88,  50, -108, 52, 24],
      [  2,  68, -122, 72, 32],
      [ 48,  60,  -62, 36, 16],
      [-28,  55,  -52, 42, 19],
      [ 68,  62, -142, 58, 26],
      [-68,  48, -132, 63, 28],
      [ 12,  58,  -44, 34, 15],
      [ 38,  72, -162, 78, 35],
      [-18,  62,  -75, 52, 23],
      [ 88,  54, -102, 44, 20],
      [-48,  66, -152, 68, 30],
      [ -2,  50,  -32, 30, 14],
      [ 58,  58,  -92, 46, 21],
    ];

    for (const [x, y, z, w, d] of cloudData) {
      const cloud = this._makeCloud(w, d);
      cloud.position.set(x, y, z);
      cloud.rotation.x = -Math.PI / 2;
      cloud.rotation.z = Math.random() * Math.PI;
      this._clouds.push(cloud);
      scene.add(cloud);
    }
  }

  _makeCloud(width, depth) {
    const CW = 512, CH = 256;
    const canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    const ctx    = canvas.getContext('2d');

    const numPuffs = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numPuffs; i++) {
      const px  = CW * (0.08 + Math.random() * 0.84);
      const py  = CH * (0.35 + Math.random() * 0.42);
      const r   = CH * (0.18 + Math.random() * 0.40);
      const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0,    'rgba(255,255,255,1.0)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.78)');
      grd.addColorStop(1,    'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  }

  // t: 0=day, 1=evening, 2=night
  update(t) {
    const s = t < 1 ? t : t - 1;  // 0→1 within current segment
    let opacity, r, g, b;
    if (t < 1) {
      // Day (white) → Evening (warm amber — matches start of night segment)
      opacity = 0.55 + s * 0.30;
      r = 1.0 - s * 0.08;   // 1.00 → 0.92
      g = 1.0 - s * 0.38;   // 1.00 → 0.62
      b = 1.0 - s * 0.65;   // 1.00 → 0.35
    } else {
      // Evening → Night: sqrt easing makes clouds go dark quickly at start of night
      const sq = Math.sqrt(s);
      opacity = 0.85 + s * 0.13;
      r = 0.92 - sq * 0.85;   // 0.92 → 0.07
      g = 0.62 - sq * 0.54;   // 0.62 → 0.08
      b = 0.35 - sq * 0.22;   // 0.35 → 0.13 (keep slight blue tint)
    }
    for (const c of this._clouds) {
      c.material.opacity = opacity;
      c.material.color.setRGB(Math.max(0, r), Math.max(0, g), Math.max(0, b));
    }
  }
}

export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;

    // Transition state — currentBlend: 0=day, 1=evening, 2=night
    this.currentBlend    = 0;
    this._blendFrom      = 0;
    this._blendTo        = 0;
    this._transitioning  = false;
    this._transitionT    = 0;
    this._transitionDur  = 4;
    this._onTransDone    = null;

    // Light refs — populated in _buildLighting()
    this._ambient    = null;
    this._sun        = null;
    this._moon       = null;
    this._neonLights = [];
    this._streetGlow = null;

    // Sky refs
    this._daySky   = null;
    this._eveSky   = null;
    this._nightSky = null;
    this._stars    = null;
    this._rain      = null;
    this._clouds    = null;
    this._lightning = null;
  }

  build() {
    this._buildSky();
    this._buildLighting();
    this._addRooftop();
    this._addNearBuildings();
    this._addSkyscrapers();
    this._addCityFloor();
    this._rain      = new RainSystem(this._scene);
    this._clouds    = new CloudSystem(this._scene);
    this._lightning = new LightningSystem(this._scene);
    this._applyBlend(0); // start as full daytime
  }

  // ── Transition API ────────────────────────────────────────────
  startTransition(targetPeriod, duration, callback) {
    const TARGET = { day: 0, evening: 1, night: 2 };
    this._blendFrom     = this.currentBlend;
    this._blendTo       = TARGET[targetPeriod] ?? 0;
    this._transitionDur = duration;
    this._transitionT   = 0;
    this._onTransDone   = callback;
    this._transitioning = true;
  }

  // Instantly snap to daytime (called on game restart).
  resetToDay() {
    this._transitioning = false;
    this.currentBlend   = 0;
    this._blendFrom     = 0;
    this._blendTo       = 0;
    this._applyBlend(0);
    if (this._rain) this._rain.setVisible(false);
  }

  setRainVisible(v)         { if (this._rain)      this._rain.setVisible(v); }
  setLightningCallback(cb)  { if (this._lightning) this._lightning.setOnStrike(cb); }

  // Instantly snap to a period with no animation (used by cheat menu).
  snapToPeriod(period) {
    const TARGET = { day: 0, evening: 1, night: 2 };
    this.currentBlend   = TARGET[period] ?? 0;
    this._blendFrom     = this.currentBlend;
    this._blendTo       = this.currentBlend;
    this._transitioning = false;
    this._applyBlend(this.currentBlend);
    if (this._rain) this._rain.setVisible(period === 'night');
  }

  // Call every frame from game.js while transitioning or rain is active
  update(dt) {
    if (this._rain)      this._rain.update(dt);
    if (this._lightning) this._lightning.update(dt, Math.max(0, this.currentBlend - 1));
    if (!this._transitioning) return;
    this._transitionT += dt;
    const raw   = Math.min(this._transitionT / this._transitionDur, 1);
    const eased = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;
    this.currentBlend = this._blendFrom + (this._blendTo - this._blendFrom) * eased;
    this._applyBlend(this.currentBlend);

    if (raw >= 1) {
      this._transitioning = false;
      const cb = this._onTransDone;
      this._onTransDone = null;
      cb?.();
    }
  }

  // ── Sky ───────────────────────────────────────────────────────
  _buildSky() {
    // Day dome (radius slightly smaller so night dome can overlay it)
    this._daySky = new THREE.Mesh(
      new THREE.SphereGeometry(376, 32, 16),
      new THREE.MeshBasicMaterial({
        map: this._makeSkyTex([
          [0.00, '#0a4898'],
          [0.28, '#1a82d0'],
          [0.55, '#42b5f5'],
          [0.78, '#80ccee'],
          [0.92, '#b5e4f8'],
          [1.00, '#d0f2ff'],
        ]),
        side: THREE.BackSide,
      })
    );
    this._scene.add(this._daySky);

    // Evening dome (sunset, sits between day and night domes)
    this._eveSky = new THREE.Mesh(
      new THREE.SphereGeometry(378, 32, 16),
      new THREE.MeshBasicMaterial({
        map: this._makeSkyTex([
          [0.00, '#1c0648'],
          [0.22, '#50159a'],
          [0.42, '#9c2560'],
          [0.60, '#e04525'],
          [0.78, '#f07030'],
          [0.90, '#f8b040'],
          [1.00, '#e86830'],
        ]),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
      })
    );
    this._scene.add(this._eveSky);

    // Night dome (opacity-animated over the day dome)
    this._nightSky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      new THREE.MeshBasicMaterial({
        map: this._makeSkyTex([
          [0.00, '#01000a'],
          [0.38, '#060015'],
          [0.65, '#110028'],
          [0.80, '#280050'],
          [0.92, '#1a0038'],
          [1.00, '#0a001e'],
        ]),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
      })
    );
    this._scene.add(this._nightSky);

    // Start as day
    this._scene.fog = new THREE.FogExp2(0xd0eeff, 0.006);
    this._scene.background = DAY_BG_COL.clone();
  }

  // ── Lighting ──────────────────────────────────────────────────
  _buildLighting() {
    // Ambient
    this._ambient = new THREE.AmbientLight(0x9ec8ff, 1.4);
    this._scene.add(this._ambient);

    // Sun (day)
    this._sun = new THREE.DirectionalLight(0xfff5e0, 3.0);
    this._sun.position.set(80, 120, -60);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.camera.far = 250;
    this._sun.shadow.camera.left = this._sun.shadow.camera.bottom = -90;
    this._sun.shadow.camera.right = this._sun.shadow.camera.top   =  90;
    this._scene.add(this._sun);

    // Moon (night, starts off)
    this._moon = new THREE.DirectionalLight(0x3355aa, 0);
    this._moon.position.set(-40, 90, 30);
    this._scene.add(this._moon);

    // Neon point lights (night-only, all start at 0)
    for (const { c, p, i, d } of [
      { c: 0x00ffff, p: [-7,  1.5,  -7], i: 3.5, d: 20 },
      { c: 0xff00cc, p: [ 7,  1.5,  -7], i: 3.5, d: 20 },
      { c: 0x00aaff, p: [-7,  1.5,   6], i: 2.5, d: 16 },
      { c: 0xaa00ff, p: [ 7,  1.5,   6], i: 2.5, d: 16 },
      { c: 0x00ccff, p: [-25,  8,  -50], i: 6.0, d: 60 },
      { c: 0xff0088, p: [ 25,  8,  -50], i: 6.0, d: 60 },
      { c: 0x8800ff, p: [  0, 12,  -90], i: 8.0, d: 80 },
    ]) {
      const light = new THREE.PointLight(c, 0, d);
      light.position.set(...p);
      light.userData.ni = i; // night intensity
      this._neonLights.push(light);
      this._scene.add(light);
    }

    // Warm street glow (night only)
    this._streetGlow = new THREE.PointLight(0xff7722, 0, 90);
    this._streetGlow.position.set(0, -48, -10);
    this._scene.add(this._streetGlow);
  }

  // t: 0=full day, 1=full evening, 2=full night
  _applyBlend(t) {
    const eveFrac = Math.min(t, 1);
    const ngtFrac = Math.max(0, t - 1);
    const segFrac = t < 1 ? t : t - 1; // 0-1 within the current segment

    this._eveSky.material.opacity    = eveFrac;
    this._nightSky.material.opacity  = ngtFrac;

    const fromBG = t < 1 ? DAY_BG_COL  : EVE_BG_COL;
    const toBG   = t < 1 ? EVE_BG_COL  : NIGHT_BG_COL;
    this._scene.background.copy(fromBG.clone().lerp(toBG, segFrac));

    const fromFog = t < 1 ? DAY_FOG_COL : EVE_FOG_COL;
    const toFog   = t < 1 ? EVE_FOG_COL : NIGHT_FOG_COL;
    this._scene.fog.color.copy(fromFog.clone().lerp(toFog, segFrac));
    this._scene.fog.density = 0.006 + 0.002 * (t / 2);

    const fromAmb = t < 1 ? DAY_AMB_COL : EVE_AMB_COL;
    const toAmb   = t < 1 ? EVE_AMB_COL : NIGHT_AMB_COL;
    this._ambient.color.copy(fromAmb.clone().lerp(toAmb, segFrac));
    this._ambient.intensity = t < 1 ? 1.4 : 1.4 - 0.5 * segFrac; // stay bright through evening

    // Sun: bright at day, golden at evening, off at night
    this._sun.intensity  = t < 1 ? 3.0 - 1.5 * segFrac : 1.5 * (1 - segFrac);
    this._moon.intensity = ngtFrac * 0.35;

    // Neon city lights: start fading in at blend 0.4 (mid-evening), full at night
    const neonFrac = Math.max(0, (t - 0.4) / 1.6);
    for (const l of this._neonLights) l.intensity = l.userData.ni * neonFrac;
    this._streetGlow.intensity = 6 * neonFrac;

    this._clouds?.update(t);
  }

  // ── Player rooftop ────────────────────────────────────────────
  _addRooftop() {
    const concMat  = new THREE.MeshLambertMaterial({ color: 0x14182e });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x1e2238 });
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x0c1020 });
    const nCyan    = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    const nPink    = new THREE.MeshBasicMaterial({ color: 0xff00cc });

    // Roof deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 16), concMat);
    deck.position.set(0, -0.175, 0);
    this._scene.add(deck);

    // Parapet lips
    for (const [x, z, w, d] of [
      [ 0, -8,  16, 0.35], // front (-Z)
      [ 0,  8,  16, 0.35], // back
      [-8,  0, 0.35, 16 ], // left
      [ 8,  0, 0.35, 16 ], // right
    ]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), metalMat);
      lip.position.set(x, 0.12, z);
      this._scene.add(lip);
    }

    // Neon edge strips
    const fNeon = new THREE.Mesh(new THREE.BoxGeometry(16, 0.07, 0.07), nCyan);
    fNeon.position.set(0, 0.45, -8);
    this._scene.add(fNeon);
    for (const sx of [-1, 1]) {
      const sNeon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 16), nPink);
      sNeon.position.set(sx * 8, 0.45, 0);
      this._scene.add(sNeon);
    }

    // Building column
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(16, 44, 16), darkMat);
    bldg.position.set(0, -22.35, 0);
    this._scene.add(bldg);

    // Window grids on building faces (front face of building is at Z=+8)
    this._winPlane(0, -15,  8.01, 16, 22,          0, '#88ccff', 0.60); // front (-Z face, visible)
    this._winPlane(-8.01, -15, 0, 16, 22, -Math.PI/2, '#ffee88', 0.55); // left
    this._winPlane( 8.01, -15, 0, 16, 22,  Math.PI/2, '#ffee88', 0.55); // right

    // Corner neon stripe down the building
    const cNeon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 20, 0.18), nCyan);
    cNeon.position.set(-8, -10, -8);
    this._scene.add(cNeon);

    this._addRoofDetails();
  }

  _addRoofDetails() {
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x1a1e30 });
    const nCyan  = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    const nPink  = new THREE.MeshBasicMaterial({ color: 0xff00aa });

    for (const [x, y, z] of [[-4, 0.3, 4], [4, 0.3, 4], [-4, 0.3, -3], [5, 0.25, -4]]) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), boxMat);
      u.position.set(x, y, z);
      this._scene.add(u);
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.07), nCyan);
      v.position.set(x, y + 0.38, z - 0.46);
      this._scene.add(v);
    }

    const antMat = new THREE.MeshLambertMaterial({ color: 0x28303e });
    const mast   = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 4.5, 6), antMat);
    mast.position.set(-5.5, 2.25, 6.5);
    this._scene.add(mast);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2200 }));
    blink.position.set(-5.5, 4.7, 6.5);
    this._scene.add(blink);

    const dishMat = new THREE.MeshLambertMaterial({ color: 0x303848 });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 0.09, 12), dishMat);
    dish.position.set(5.5, 0.38, 5.5);
    dish.rotation.x = -0.45;
    this._scene.add(dish);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.8, 0.12), nPink);
    sign.position.set(2, 0.7, 7.95);
    this._scene.add(sign);
  }

  // ── Near buildings ────────────────────────────────────────────
  // Tops at Y = -3 to -8, well below drone flight height (Y ≥ 3.5)
  _addNearBuildings() {
    // [cx, cz, w, d, h, topY]
    for (const [cx, cz, w, d, h, topY] of [
      [-20, -14,  9, 7, 12, -4],
      [ 20, -14,  7, 9, 14, -3],
      [-23,   4,  8, 7, 10, -6],
      [ 23,   4,  8, 7, 10, -6],
      [-18, -25, 10, 8, 16, -3],
      [ 18, -25, 10, 8, 16, -3],
      [ -9,  11,  6, 6,  8, -7],
      [  9,  11,  6, 6,  8, -7],
      [-14,  14,  7, 5,  9, -5],
      [ 14,  14,  7, 5,  9, -5],
    ]) {
      const cy = topY - h / 2;
      const mat = new THREE.MeshLambertMaterial({ color: 0x0d1122 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      box.position.set(cx, cy, cz);
      this._scene.add(box);

      // Roof neon accent
      const col = (cx < 0) ? 0x00ffcc : 0xff00aa;
      const nm  = new THREE.MeshBasicMaterial({ color: col });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.07, 0.07), nm);
      strip.position.set(cx, topY + 0.07, cz + d / 2 + 0.02);
      this._scene.add(strip);

      // Window on the face toward the player (+Z face)
      this._winPlane(cx, cy, cz + d/2 + 0.01, w, h * 0.75, 0, '#ffee88', 0.45);
    }
  }

  // ── Background skyscrapers ────────────────────────────────────
  // All behind the drone spawn zone (≥ 60 m).
  // rotY rotates the whole building so its "front window" face is varied.
  _addSkyscrapers() {
    // [cx, cz, w, d, h, topY, neonColor, rotY]
    for (const cfg of [
      [   0, -100, 14, 12,  85, 40, 0xff0066,           0],
      [ -35,  -80,  9,  8,  58, 22, 0x00ffff,  Math.PI/8],
      [  35,  -80,  9,  8,  58, 22, 0xff00aa, -Math.PI/8],
      [ -55,  -75,  8,  7,  45, 14, 0xffaa00,  Math.PI/3],
      [  55,  -75,  8,  7,  45, 14, 0x00ff88, -Math.PI/3],
      [ -70,  -95,  8,  8,  40,  8, 0xff4488,  Math.PI/2],
      [  70,  -95,  8,  8,  40,  8, 0x44ffcc, -Math.PI/2],
      [ -22,  -95,  8,  7,  55, 20, 0x8800ff,           0],
      [  22,  -95,  8,  7,  55, 20, 0x00aaff,           0],
      [ -50,  -25,  9,  8,  36,  5, 0xff3366,  Math.PI/2],
      [  50,  -25,  9,  8,  36,  5, 0x33aaff, -Math.PI/2],
      [ -60,   -5,  8,  7,  30,  0, 0xffaa33,  Math.PI/2],
      [  60,   -5,  8,  7,  30,  0, 0xaa33ff, -Math.PI/2],
      [ -90, -110, 10,  9,  35,  5, 0x003366,  Math.PI/2],
      [  90, -110, 10,  9,  35,  5, 0x330066, -Math.PI/2],
      [   0, -140, 16, 14,  60, 18, 0x220055,           0],
      [ -45, -120,  7,  7,  45, 12, 0x002244,  Math.PI/4],
      [  45, -120,  7,  7,  45, 12, 0x002244, -Math.PI/4],
    ]) {
      this._addSkyscraper(...cfg);
    }
  }

  _addSkyscraper(cx, cz, w, d, h, topY, neonColor, rotY = 0) {
    const cy = topY - h / 2;

    // Group handles position + rotation so geometry stays in local coords
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    this._scene.add(g);

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: 0x080c18 })
    );
    body.position.set(0, cy, 0);
    g.add(body);

    // Front window face in LOCAL +Z direction (d/2 offset = closest to player before rotation)
    const ftex = this._makeWindowTex(Math.round(w) + 2, Math.round(h * 0.6) + 4, 0.65, '#ffee88');
    const fwin = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, h * 0.92),
      new THREE.MeshBasicMaterial({ map: ftex })
    );
    fwin.position.set(0, cy, d / 2 + 0.02); // on the LOCAL +Z face
    fwin.rotation.y = 0;                    // normal = local +Z → visible from local -Z direction
    g.add(fwin);

    // Side window — opposite face (local -Z, visible from other angle)
    const stex = this._makeWindowTex(Math.round(d) + 2, Math.round(h * 0.5) + 2, 0.45, '#88ccff');
    const swin = new THREE.Mesh(
      new THREE.PlaneGeometry(d * 0.88, h * 0.88),
      new THREE.MeshBasicMaterial({ map: stex })
    );
    swin.position.set(0, cy, -(d / 2 + 0.02)); // local -Z face
    swin.rotation.y = Math.PI;                  // normal = local -Z
    g.add(swin);

    // Neon crown on top (local space)
    const nMat  = new THREE.MeshBasicMaterial({ color: neonColor });
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.35, d * 0.85), nMat);
    crown.position.set(0, topY + 0.18, 0);
    g.add(crown);

    // Vertical neon stripe down one corner (local space)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.75, 0.22), nMat);
    stripe.position.set(-w / 2, cy + h * 0.05, d / 2);
    g.add(stripe);

    // Mid-building neon sign (skip silhouette-only far buildings)
    if (neonColor > 0x100000) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.7, 0.2), nMat);
      sign.position.set(0, topY - 5, d / 2 + 0.12);
      g.add(sign);
    }
  }

  // ── City floor ────────────────────────────────────────────────
  _addCityFloor() {
    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: 0x060810 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -55;
    this._scene.add(gnd);

    const gridMat = new THREE.MeshBasicMaterial({ color: 0x182238 });
    for (let i = -10; i <= 10; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(700, 0.1, 1.2), gridMat);
      h.position.set(0, -54.95, i * 30);
      this._scene.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 700), gridMat);
      v.position.set(i * 30, -54.95, 0);
      this._scene.add(v);
    }

    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshBasicMaterial({ color: 0x2a0818, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -46;
    this._scene.add(haze);
  }

  // ── Helpers ───────────────────────────────────────────────────

  // Place a window-grid plane at world (x, y, z), rotated by rotY around Y axis.
  // faceW/faceH define the plane dimensions; litDensity = fraction of lit windows.
  _winPlane(x, y, z, faceW, faceH, rotY, litColor, litDensity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW * 0.9, faceH * 0.9),
      new THREE.MeshBasicMaterial({
        map: this._makeWindowTex(
          Math.max(2, Math.round(faceW) + 1),
          Math.max(2, Math.round(faceH * 0.6) + 2),
          litDensity, litColor
        ),
      })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this._scene.add(mesh);
  }

  _makeSkyTex(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g   = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [p, c] of stops) g.addColorStop(p, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
    return new THREE.CanvasTexture(canvas);
  }

  _makeWindowTex(cols, rows, litDensity, litColor) {
    const PX = 8;
    const canvas = document.createElement('canvas');
    canvas.width  = cols * PX;
    canvas.height = rows * PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < litDensity) {
          const rnd = Math.random();
          ctx.fillStyle = rnd < 0.45 ? '#ffee88' :
                          rnd < 0.70 ? litColor :
                          rnd < 0.85 ? '#88ccff' : '#ff9966';
          ctx.fillRect(c * PX + 1, r * PX + 1, PX - 2, PX - 3);
        }
      }
    }
    return new THREE.CanvasTexture(canvas);
  }
}
