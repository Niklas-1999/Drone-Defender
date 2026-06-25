import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;
  }

  build() {
    this._addSky();
    this._addFog();
    this._addLighting();
    this._addRooftop();
    this._addNearBuildings();
    this._addSkyscrapers();
    this._addCityFloor();
  }

  // ── Night sky ─────────────────────────────────────────────────
  _addSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 512;
    const ctx  = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.00, '#01000a'); // zenith — near-black
    grad.addColorStop(0.38, '#060015'); // upper sky
    grad.addColorStop(0.65, '#110028'); // mid sky — deep purple
    grad.addColorStop(0.80, '#280050'); // near horizon — neon glow
    grad.addColorStop(0.92, '#1a0038'); // horizon
    grad.addColorStop(1.00, '#0a001e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);

    this._scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.BackSide })
    ));
    this._scene.background = new THREE.Color(0x0a001e);

    // Stars — upper hemisphere only
    const STARS = 1400;
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45; // keep near zenith
      const r  = 360 + Math.random() * 12;
      pos[i*3  ] = r * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = r * Math.cos(ph) + 15;
      pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._scene.add(new THREE.Points(sg,
      new THREE.PointsMaterial({ color: 0xdde8ff, size: 0.85, sizeAttenuation: true })
    ));
  }

  _addFog() {
    // Thin purple exponential fog — far buildings fade, close ones crisp
    this._scene.fog = new THREE.FogExp2(0x080018, 0.007);
  }

  // ── Cyberpunk lighting ────────────────────────────────────────
  _addLighting() {
    // Deep purple ambient — everything has a purple shadow tint
    this._scene.add(new THREE.AmbientLight(0x1a083a, 0.9));

    // Faint cool "moon" directional from above-back
    const moon = new THREE.DirectionalLight(0x3355aa, 0.35);
    moon.position.set(-40, 90, 30);
    this._scene.add(moon);

    // Neon point lights spilling off the rooftop and near buildings
    const neons = [
      { c: 0x00ffff, p: [-7,  1.5, -7 ], i: 3.5, d: 20 }, // cyan — left front
      { c: 0xff00cc, p: [ 7,  1.5, -7 ], i: 3.5, d: 20 }, // pink — right front
      { c: 0x00aaff, p: [-7,  1.5,  6 ], i: 2.5, d: 16 }, // blue — left back
      { c: 0xaa00ff, p: [ 7,  1.5,  6 ], i: 2.5, d: 16 }, // violet — right back
      // Wider-range lights for distant buildings
      { c: 0x00ccff, p: [-25,  8, -50], i: 6.0, d: 60 },
      { c: 0xff0088, p: [ 25,  8, -50], i: 6.0, d: 60 },
      { c: 0x8800ff, p: [  0, 12, -90], i: 8.0, d: 80 },
    ];
    for (const { c, p, i, d } of neons) {
      const light = new THREE.PointLight(c, i, d);
      light.position.set(...p);
      this._scene.add(light);
    }

    // Warm amber glow rising from streets far below
    const streetGlow = new THREE.PointLight(0xff7722, 6, 90);
    streetGlow.position.set(0, -48, -10);
    this._scene.add(streetGlow);
  }

  // ── Player rooftop ────────────────────────────────────────────
  _addRooftop() {
    const concMat  = new THREE.MeshLambertMaterial({ color: 0x14182e });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x1e2238 });
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x0c1020 });
    const nCyan    = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    const nPink    = new THREE.MeshBasicMaterial({ color: 0xff00cc });

    // Flat roof deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 16), concMat);
    deck.position.set(0, -0.175, 0);
    this._scene.add(deck);

    // Raised parapet lip around all four edges
    for (const [x, z, w, d] of [
      [ 0, -8,  16, 0.35], // front  (-Z)
      [ 0,  8,  16, 0.35], // back   (+Z)
      [-8,  0, 0.35, 16 ], // left
      [ 8,  0, 0.35, 16 ], // right
    ]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), metalMat);
      lip.position.set(x, 0.12, z);
      this._scene.add(lip);
    }

    // Cyan neon strip on the front parapet (faces the enemies)
    const frontNeon = new THREE.Mesh(new THREE.BoxGeometry(16, 0.07, 0.07), nCyan);
    frontNeon.position.set(0, 0.45, -8);
    this._scene.add(frontNeon);

    // Pink neon on side parapets
    for (const sx of [-1, 1]) {
      const sideNeon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 16), nPink);
      sideNeon.position.set(sx * 8, 0.45, 0);
      this._scene.add(sideNeon);
    }

    // Building column extending far below the rooftop
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(16, 44, 16), darkMat);
    bldg.position.set(0, -22.35, 0);
    this._scene.add(bldg);

    // Window grid on the building's visible faces
    this._applyWindowGrid(0, -15, -8.01, 16, 22, 0, '#88ccff', 0.60);  // front face
    this._applyWindowGrid(-8.01, -15, 0, 16, 22, -Math.PI/2, '#ffee88', 0.55); // left
    this._applyWindowGrid( 8.01, -15, 0, 16, 22,  Math.PI/2, '#ffee88', 0.55); // right

    // Vertical cyan neon stripe down the building corner
    const cornerNeon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 20, 0.18), nCyan);
    cornerNeon.position.set(-8, -10, -8);
    this._scene.add(cornerNeon);

    this._addRoofDetails();
  }

  _addRoofDetails() {
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x1a1e30 });
    const nCyan  = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    const nPink  = new THREE.MeshBasicMaterial({ color: 0xff00aa });

    // HVAC / ventilation units
    const hvacs = [[-4, 0.3, 4], [4, 0.3, 4], [-4, 0.3, -3], [5, 0.25, -4]];
    for (const [x, y, z] of hvacs) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), boxMat);
      unit.position.set(x, y, z);
      this._scene.add(unit);
      // Small cyan vent slit
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.07), nCyan);
      vent.position.set(x, y + 0.38, z - 0.46);
      this._scene.add(vent);
    }

    // Tall antenna mast (back-left corner)
    const antMat = new THREE.MeshLambertMaterial({ color: 0x28303e });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 4.5, 6), antMat);
    mast.position.set(-5.5, 2.25, 6.5);
    this._scene.add(mast);
    // Red warning blinker atop mast
    const blink = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff2200 })
    );
    blink.position.set(-5.5, 4.7, 6.5);
    this._scene.add(blink);

    // Satellite dish
    const dishMat = new THREE.MeshLambertMaterial({ color: 0x303848 });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 0.09, 12), dishMat);
    dish.position.set(5.5, 0.38, 5.5);
    dish.rotation.x = -0.45;
    this._scene.add(dish);

    // Pink neon sign on back parapet
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.8, 0.12), nPink);
    sign.position.set(2, 0.7, 7.95);
    this._scene.add(sign);
  }

  // ── Short buildings in the near zone (10–40 m) ───────────────
  // Tops are at Y = -3 to -8 — comfortably below drone height (Y ≥ 3.5)
  _addNearBuildings() {
    const cfg = [
      // [cx, cz, w, d, h, topY]
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
    ];
    for (const [cx, cz, w, d, h, topY] of cfg) {
      this._addBox(cx, topY - h/2, cz, w, h, d, 0x0d1122);
      // Small neon accent on roof
      const col = (cx < 0) ? 0x00ffcc : 0xff00aa;
      const mat = new THREE.MeshBasicMaterial({ color: col });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.07, 0.07), mat);
      strip.position.set(cx, topY + 0.07, cz - d/2 - 0.02);
      this._scene.add(strip);
      // Dim windows on front face
      this._applyWindowGrid(cx, topY - h/2, cz - d/2 - 0.01,
        w, h * 0.75, 0, '#ffee88', 0.45);
    }
  }

  // ── Background skyscrapers (65 m+) ───────────────────────────
  // These are BEHIND the enemy spawn zone, so they can be very tall.
  _addSkyscrapers() {
    // [cx, cz, w, d, h, topY, neonColor]
    const scrapers = [
      // Central spire — directly behind, tallest
      [  0, -100, 14, 12,  85, 40, 0xff0066],
      // Left/right flanks behind spawn zone
      [-35,  -80,  9,  8,  58, 22, 0x00ffff],
      [ 35,  -80,  9,  8,  58, 22, 0xff00aa],
      // Mid-distance left/right
      [-55,  -75,  8,  7,  45, 14, 0xffaa00],
      [ 55,  -75,  8,  7,  45, 14, 0x00ff88],
      // Further back
      [-70,  -95,  8,  8,  40,  8, 0xff4488],
      [ 70,  -95,  8,  8,  40,  8, 0x44ffcc],
      [ -22, -95,  8,  7,  55, 20, 0x8800ff],
      [  22, -95,  8,  7,  55, 20, 0x00aaff],
      // Far flankers (to the sides, not in front)
      [-50,  -25,  9,  8,  36,  5, 0xff3366],
      [ 50,  -25,  9,  8,  36,  5, 0x33aaff],
      [-60,   -5,  8,  7,  30,  0, 0xffaa33],
      [ 60,   -5,  8,  7,  30,  0, 0xaa33ff],
      // Deep background — low-res silhouettes
      [-90,  -110, 10, 9,  35,  5, 0x003366],
      [ 90,  -110, 10, 9,  35,  5, 0x330066],
      [  0,  -140, 16, 14, 60, 18, 0x220055],
      [-45,  -120,  7,  7, 45, 12, 0x002244],
      [ 45,  -120,  7,  7, 45, 12, 0x002244],
    ];

    for (const [cx, cz, w, d, h, topY, neon] of scrapers) {
      this._addSkyscraper(cx, cz, w, d, h, topY, neon);
    }
  }

  _addSkyscraper(cx, cz, w, d, h, topY, neonColor) {
    const cy = topY - h / 2;

    // Building body
    this._addBox(cx, cy, cz, w, h, d, 0x080c18);

    // Windows on front face (-Z toward player)
    this._applyWindowGrid(
      cx, cy, cz - d/2 - 0.02,
      w, h * 0.88, 0,
      '#ffee88', 0.62
    );
    // Side windows
    this._applyWindowGrid(
      cx - w/2 - 0.02, cy, cz,
      d, h * 0.88, -Math.PI/2,
      '#88ccff', 0.50
    );
    this._applyWindowGrid(
      cx + w/2 + 0.02, cy, cz,
      d, h * 0.88, Math.PI/2,
      '#88ccff', 0.50
    );

    // Neon crown on top of building
    const nMat = new THREE.MeshBasicMaterial({ color: neonColor });
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.35, d * 0.85), nMat);
    crown.position.set(cx, topY + 0.18, cz);
    this._scene.add(crown);

    // Vertical neon stripe down one corner
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.75, 0.22), nMat);
    stripe.position.set(cx - w/2, cy + h * 0.05, cz - d/2);
    this._scene.add(stripe);

    // Optional neon sign mid-building
    if (neonColor > 0x100000) { // skip the very-dark "silhouette" buildings
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, 0.7, 0.2), nMat);
      sign.position.set(cx, topY - 5, cz - d/2 - 0.12);
      this._scene.add(sign);
    }
  }

  // ── City floor far below ──────────────────────────────────────
  _addCityFloor() {
    // Dark ground plane
    const gMat = new THREE.MeshLambertMaterial({ color: 0x060810 });
    const gnd  = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), gMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -55;
    this._scene.add(gnd);

    // Street-grid lines
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x182238 });
    for (let i = -10; i <= 10; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(700, 0.1, 1.2), gridMat);
      h.position.set(0, -54.95, i * 30);
      this._scene.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 700), gridMat);
      v.position.set(i * 30, -54.95, 0);
      this._scene.add(v);
    }

    // Warm haze just above street level
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0x2a0818, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    });
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), hazeMat);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -46;
    this._scene.add(haze);
  }

  // ── Utility helpers ───────────────────────────────────────────

  // Add a simple box at world position (cx, cy, cz)
  _addBox(cx, cy, cz, w, h, d, color) {
    const mat  = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, cy, cz);
    this._scene.add(mesh);
    return mesh;
  }

  // Place a window-grid plane at (x, y, z) with a Y rotation
  // faceW / faceH: size of the plane; litDensity: fraction of lit windows
  _applyWindowGrid(x, y, z, faceW, faceH, rotY, litColor, litDensity) {
    const tex  = this._makeWindowTex(
      Math.max(2, Math.round(faceW) + 1),
      Math.max(2, Math.round(faceH * 0.6) + 2),
      litDensity, litColor
    );
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW * 0.9, faceH * 0.9),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this._scene.add(mesh);
  }

  // Generate a randomised window-grid canvas texture
  _makeWindowTex(cols, rows, litDensity, litColor) {
    const PX = 8;
    const canvas = document.createElement('canvas');
    canvas.width  = cols * PX;
    canvas.height = rows * PX;
    const ctx = canvas.getContext('2d');

    // Dark building face
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < litDensity) {
          const rnd = Math.random();
          ctx.fillStyle =
            rnd < 0.45 ? '#ffee88' :    // warm yellow
            rnd < 0.70 ? litColor  :    // building accent colour
            rnd < 0.85 ? '#88ccff' :    // cool blue
                          '#ff9966';    // orange warmth
          ctx.fillRect(c * PX + 1, r * PX + 1, PX - 2, PX - 3);
        }
      }
    }
    return new THREE.CanvasTexture(canvas);
  }
}
