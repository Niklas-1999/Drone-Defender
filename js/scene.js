import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Builds all static environment geometry and lighting.
export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;
  }

  // Returns { baseCore, baseCoreLight, baseCorePos }
  build() {
    this._addSkyAndFog();
    this._addLighting();
    this._addGround();
    this._addStars();
    this._addRocks();
    this._addDistantStructures();
    this._addPlayerPlatform();
    return this._addBaseCore();
  }

  // ── Sky / fog ─────────────────────────────────────────────────
  _addSkyAndFog() {
    this._scene.background = new THREE.Color(0x080614);
    this._scene.fog = new THREE.FogExp2(0x0a0918, 0.012);
  }

  // ── Lighting ──────────────────────────────────────────────────
  _addLighting() {
    const ambient = new THREE.AmbientLight(0x111830, 0.6);
    this._scene.add(ambient);

    // Alien sun – orange-ish, low on horizon
    const sun = new THREE.DirectionalLight(0xff7733, 1.8);
    sun.position.set(60, 40, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far  = 250;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -100;
    sun.shadow.camera.right = sun.shadow.camera.top   =  100;
    this._scene.add(sun);

    // Cool blue fill
    const fill = new THREE.DirectionalLight(0x334488, 0.4);
    fill.position.set(-40, 20, 40);
    this._scene.add(fill);
  }

  // ── Ground ────────────────────────────────────────────────────
  _addGround() {
    const geo = new THREE.PlaneGeometry(400, 400, 48, 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.sqrt(x * x + z * z);
      // Keep the central platform area flat
      if (r > 6) {
        pos.setY(i, (Math.sin(x * 0.18) + Math.cos(z * 0.22)) * 0.7
                   + (Math.random() - 0.5) * 1.0);
      }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ color: 0x3b2416 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this._scene.add(mesh);
  }

  // ── Stars ─────────────────────────────────────────────────────
  _addStars() {
    const verts = [];
    for (let i = 0; i < 2500; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 250 + Math.random() * 80;
      verts.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this._scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })));
  }

  // ── Rocks ─────────────────────────────────────────────────────
  _addRocks() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
    const positions = [
      [18, 12], [-22, 16], [28, -18], [-14, -26],
      [32, 6],  [-38, -8], [10, 34],  [-10, -35],
      [45, 20], [-50, 22], [22, -42], [-25, 40],
    ];
    for (const [x, z] of positions) {
      const scale = 1.2 + Math.random() * 2.5;
      const geo   = new THREE.DodecahedronGeometry(scale, 0);
      const mesh  = new THREE.Mesh(geo, mat);
      mesh.position.set(x, scale * 0.35, z);
      mesh.rotation.set(Math.random() * 2, Math.random() * 6, Math.random() * 2);
      mesh.castShadow = true;
      this._scene.add(mesh);
    }
  }

  // ── Distant sci-fi structures ─────────────────────────────────
  _addDistantStructures() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a2233 });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.3;
      const dist  = 70 + Math.random() * 25;
      const h     = 4 + Math.random() * 10;
      const w     = 1.5 + Math.random() * 2;
      const mesh  = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      mesh.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      this._scene.add(mesh);

      // Small glow at top
      const glow = new THREE.PointLight(0x0033ff, 0.8, 12);
      glow.position.set(Math.cos(angle) * dist, h + 0.5, Math.sin(angle) * dist);
      this._scene.add(glow);
    }
  }

  // ── Player platform ───────────────────────────────────────────
  _addPlayerPlatform() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x222d3a });
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 5.5, 0.6, 10),
      mat
    );
    platform.position.set(0, -0.3, 0);
    platform.receiveShadow = true;
    this._scene.add(platform);

    // Rim light strip
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.8, 0.07, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x00aaff })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.01;
    this._scene.add(rim);
  }

  // ── Base core crystal ─────────────────────────────────────────
  _addBaseCore() {
    // Pedestal
    const pedMat  = new THREE.MeshLambertMaterial({ color: 0x223344 });
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 1.5, 8),
      pedMat
    );
    pedestal.position.set(0, 0.75, -5);
    pedestal.castShadow = true;
    this._scene.add(pedestal);

    // Crystal
    const coreMat = new THREE.MeshPhongMaterial({
      color: 0x00ccff,
      emissive: 0x004466,
      shininess: 120,
      transparent: true,
      opacity: 0.88,
    });
    const baseCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.2, 1),
      coreMat
    );
    baseCore.position.set(0, 2.5, -5);
    baseCore.castShadow = true;
    this._scene.add(baseCore);

    // Outer glow shell
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x0088cc,
      transparent: true,
      opacity: 0.06,
      side: THREE.BackSide,
    });
    baseCore.add(new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8), glowMat));

    // Point light
    const coreLight = new THREE.PointLight(0x00ccff, 3, 30);
    coreLight.position.copy(baseCore.position);
    this._scene.add(coreLight);

    return {
      baseCore,
      baseCoreLight: coreLight,
      baseCorePos: baseCore.position.clone(),
    };
  }
}
