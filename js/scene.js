import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

export class SceneBuilder {
  constructor(scene) {
    this._scene = scene;
  }

  // No longer returns a base core — environment only.
  build() {
    this._addSkyAndFog();
    this._addLighting();
    this._addGround();
    this._addStars();
    this._addRocks();
    this._addDistantStructures();
    this._addBunker();
  }

  _addSkyAndFog() {
    this._scene.background = new THREE.Color(0x080614);
    this._scene.fog = new THREE.FogExp2(0x0a0918, 0.013);
  }

  _addLighting() {
    this._scene.add(new THREE.AmbientLight(0x111830, 0.6));

    const sun = new THREE.DirectionalLight(0xff7733, 1.8);
    sun.position.set(60, 40, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.far = 200;
    [-80, 80].forEach(v => {
      sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
      sun.shadow.camera.right = sun.shadow.camera.top = 80;
    });
    this._scene.add(sun);

    const fill = new THREE.DirectionalLight(0x334488, 0.4);
    fill.position.set(-40, 20, -30);
    this._scene.add(fill);
  }

  _addGround() {
    const geo = new THREE.PlaneGeometry(400, 400, 48, 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (Math.sqrt(x * x + z * z) > 8) {
        pos.setY(i,
          (Math.sin(x * 0.18) + Math.cos(z * 0.22)) * 0.7
          + (Math.random() - 0.5) * 1.0
        );
      }
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo,
      new THREE.MeshLambertMaterial({ color: 0x3b2416 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this._scene.add(mesh);
  }

  _addStars() {
    const verts = [];
    for (let i = 0; i < 2500; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 240 + Math.random() * 80;
      verts.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this._scene.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.55 })
    ));
  }

  _addRocks() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
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

  _addDistantStructures() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a2233 });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.3;
      const dist  = 70 + Math.random() * 25;
      const h     = 4 + Math.random() * 10;
      const w     = 1.5 + Math.random() * 2;

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      mesh.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      this._scene.add(mesh);

      const glow = new THREE.PointLight(0x0033ff, 0.8, 12);
      glow.position.set(Math.cos(angle) * dist, h + 0.5, Math.sin(angle) * dist);
      this._scene.add(glow);
    }
  }

  // Low concrete bunker walls around the player starting area.
  _addBunker() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a3040 });
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });

    // Four wall segments with a gap in front (-Z)
    const walls = [
      // [x, z, width, depth]
      [ 0,   4.5,  6, 0.5],  // back wall
      [-3.5, 1.5,  0.5, 6],  // left wall
      [ 3.5, 1.5,  0.5, 6],  // right wall
    ];
    for (const [x, z, w, d] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), mat);
      wall.position.set(x, 0.55, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this._scene.add(wall);
    }

    // Platform floor
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.5, 0.25, 10), mat
    );
    platform.position.set(0, -0.12, 1.5);
    platform.receiveShadow = true;
    this._scene.add(platform);

    // Glowing rim strip on platform edge
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(4.1, 0.05, 6, 40), rimMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.02, 1.5);
    this._scene.add(rim);
  }
}
