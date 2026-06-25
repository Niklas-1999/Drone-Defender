import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;
  }

  build() {
    this._addSky();
    this._addLighting();
    this._addGround();
    this._addRocks();
    this._addDistantStructures();
    this._addBunker();
  }

  // ── Bright daytime sky ────────────────────────────────────────
  _addSky() {
    // Gradient sky dome via canvas texture (no external import needed)
    const canvas = document.createElement('canvas');
    canvas.width  = 2;
    canvas.height = 256;
    const ctx  = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#0b2a6b');  // zenith – deep blue
    grad.addColorStop(0.30, '#1565c0');  // upper sky
    grad.addColorStop(0.60, '#42a5f5');  // mid sky
    grad.addColorStop(0.80, '#90caf9');  // lower sky
    grad.addColorStop(0.92, '#e3f2fd');  // near-horizon haze
    grad.addColorStop(1.00, '#cfd8dc');  // horizon
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.MeshBasicMaterial({
        map:  new THREE.CanvasTexture(canvas),
        side: THREE.BackSide,
      })
    );
    this._scene.add(skyDome);

    // Light atmosphere haze
    this._scene.fog = new THREE.FogExp2(0xc8e6f5, 0.005);
    // Fallback background colour (seen if dome ever gaps)
    this._scene.background = new THREE.Color(0x90caf9);
  }

  // ── Bright outdoor lighting ───────────────────────────────────
  _addLighting() {
    // Strong sky-reflected ambient
    this._scene.add(new THREE.AmbientLight(0xcce8ff, 1.4));

    // Main sun – high afternoon position in front of player
    const sun = new THREE.DirectionalLight(0xfff5c0, 3.0);
    sun.position.set(80, 120, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far  = 250;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -90;
    sun.shadow.camera.right = sun.shadow.camera.top   =  90;
    this._scene.add(sun);

    // Soft bounce light from ground
    const bounce = new THREE.DirectionalLight(0xfff0d0, 0.6);
    bounce.position.set(-40, -10, 20);
    this._scene.add(bounce);
  }

  // ── Sandy terrain ─────────────────────────────────────────────
  _addGround() {
    const geo = new THREE.PlaneGeometry(400, 400, 48, 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (Math.sqrt(x * x + z * z) > 8) {
        pos.setY(i,
          (Math.sin(x * 0.18) + Math.cos(z * 0.22)) * 0.5
          + (Math.random() - 0.5) * 0.8
        );
      }
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({ color: 0xc4a265 })  // sandy desert
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this._scene.add(mesh);
  }

  // ── Desert rocks ──────────────────────────────────────────────
  _addRocks() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const positions = [
      [18,12],[-22,16],[28,-18],[-14,-26],
      [32,6], [-38,-8],[10,34], [-10,-35],
      [46,20],[-52,22],[22,-42],[-24,40],
    ];
    for (const [x, z] of positions) {
      const scale = 1.2 + Math.random() * 2.5;
      const mesh  = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale, 0), mat
      );
      mesh.position.set(x, scale * 0.35, z);
      mesh.rotation.set(Math.random()*2, Math.random()*6, Math.random()*2);
      mesh.castShadow = true;
      this._scene.add(mesh);
    }
  }

  // ── Distant outpost structures ────────────────────────────────
  _addDistantStructures() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x546e7a });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + 0.3;
      const dist  = 70 + Math.random() * 25;
      const h     = 4 + Math.random() * 10;
      const w     = 1.5 + Math.random() * 2;
      const mesh  = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      mesh.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      mesh.castShadow = true;
      this._scene.add(mesh);
    }
  }

  // ── Player bunker ─────────────────────────────────────────────
  _addBunker() {
    const mat    = new THREE.MeshLambertMaterial({ color: 0x455a64 });
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });

    const walls = [
      [ 0,   4.5, 6, 0.5],
      [-3.5, 1.5, 0.5, 6],
      [ 3.5, 1.5, 0.5, 6],
    ];
    for (const [x, z, w, d] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), mat);
      wall.position.set(x, 0.55, z);
      wall.castShadow = wall.receiveShadow = true;
      this._scene.add(wall);
    }

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.5, 0.25, 10), mat
    );
    platform.position.set(0, -0.12, 1.5);
    platform.receiveShadow = true;
    this._scene.add(platform);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.1, 0.05, 6, 40), rimMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.02, 1.5);
    this._scene.add(rim);
  }
}
