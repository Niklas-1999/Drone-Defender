import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Day colour constants
const DAY_AMB_COL   = new THREE.Color(0x9ec8ff);
const DAY_FOG_COL   = new THREE.Color(0xb8d0e8);
const DAY_BG_COL    = new THREE.Color(0x90caf9);
// Night colour constants
const NIGHT_AMB_COL = new THREE.Color(0x1a083a);
const NIGHT_FOG_COL = new THREE.Color(0x080018);
const NIGHT_BG_COL  = new THREE.Color(0x0a001e);

export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;

    // Transition state (0 = full day, 1 = full night)
    this.currentBlend    = 0;
    this._isNight        = false;
    this._transitioning  = false;
    this._transitionT    = 0;
    this._transitionDur  = 4;
    this._toNight        = false;
    this._onTransDone    = null;

    // Light refs — populated in _buildLighting()
    this._ambient    = null;
    this._sun        = null;
    this._moon       = null;
    this._neonLights = [];
    this._streetGlow = null;

    // Sky refs
    this._daySky  = null;
    this._nightSky = null;
    this._stars    = null;
  }

  build() {
    this._buildSky();
    this._buildLighting();
    this._addRooftop();
    this._addNearBuildings();
    this._addSkyscrapers();
    this._addCityFloor();
    this._applyBlend(0); // start as full daytime
  }

  // ── Transition API ────────────────────────────────────────────
  startTransition(isNight, duration, callback) {
    this._toNight       = isNight;
    this._transitionDur = duration;
    this._transitionT   = 0;
    this._onTransDone   = callback;
    this._transitioning = true;
  }

  // Instantly snap to daytime (called on game restart).
  resetToDay() {
    this._transitioning = false;
    this._isNight       = false;
    this.currentBlend   = 0;
    this._applyBlend(0);
  }

  // Call every frame from game.js while transitioning
  update(dt) {
    if (!this._transitioning) return;
    this._transitionT += dt;
    const raw   = Math.min(this._transitionT / this._transitionDur, 1);
    const eased = raw < 0.5 ? 2 * raw * raw : -1 + (4 - 2 * raw) * raw;
    this.currentBlend = this._toNight ? eased : 1 - eased;
    this._applyBlend(this.currentBlend);

    if (raw >= 1) {
      this._isNight       = this._toNight;
      this._transitioning = false;
      const cb = this._onTransDone;
      this._onTransDone = null;
      cb?.();
    }
  }

  get isNight() { return this._isNight; }

  // ── Sky ───────────────────────────────────────────────────────
  _buildSky() {
    // Day dome (radius slightly smaller so night dome can overlay it)
    this._daySky = new THREE.Mesh(
      new THREE.SphereGeometry(376, 32, 16),
      new THREE.MeshBasicMaterial({
        map: this._makeSkyTex([
          [0.00, '#0b2a6b'],
          [0.30, '#1565c0'],
          [0.60, '#42a5f5'],
          [0.80, '#90caf9'],
          [0.92, '#c8dff0'],
          [1.00, '#b0cce0'],
        ]),
        side: THREE.BackSide,
      })
    );
    this._scene.add(this._daySky);

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

    // Stars — only fade in at night
    const STARS = 1400;
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      const r  = 362 + Math.random() * 10;
      pos[i*3  ] = r * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = r * Math.cos(ph) + 15;
      pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._stars = new THREE.Points(sg,
      new THREE.PointsMaterial({
        color: 0xdde8ff, size: 0.85, sizeAttenuation: true,
        transparent: true, opacity: 0,
      })
    );
    this._scene.add(this._stars);

    // Start as day
    this._scene.fog = new THREE.FogExp2(0xb8d0e8, 0.006);
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

  // Interpolate every animated value between day and night
  _applyBlend(t) {
    this._nightSky.material.opacity  = t;
    this._stars.material.opacity     = t;
    this._scene.background.copy(DAY_BG_COL.clone().lerp(NIGHT_BG_COL, t));
    this._scene.fog.color.copy(DAY_FOG_COL.clone().lerp(NIGHT_FOG_COL, t));
    this._scene.fog.density  = 0.006 + 0.001 * t;
    this._ambient.color.copy(DAY_AMB_COL.clone().lerp(NIGHT_AMB_COL, t));
    this._ambient.intensity  = 1.4 - 0.5 * t;
    this._sun.intensity      = 3.0 * (1 - t);
    this._moon.intensity     = 0.35 * t;
    for (const l of this._neonLights) l.intensity = l.userData.ni * t;
    this._streetGlow.intensity = 6 * t;
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
