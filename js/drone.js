import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// ── Drone specs ───────────────────────────────────────────────
export const DRONE_TYPES = {
  scout: {
    name: 'scout', hp: 1, speed: 7,   size: 0.38, damage: 8,
    color: 0xff3322, points: 100, armLen: 0.28,
  },
  warrior: {
    name: 'warrior', hp: 3, speed: 4.0, size: 0.55, damage: 18,
    color: 0xff6600, points: 250, armLen: 0.40,
  },
  titan: {
    name: 'titan',   hp: 8, speed: 2.0, size: 0.85, damage: 35,
    color: 0x990000, points: 500, armLen: 0.62,
  },
};

// ── HP-bar canvas (one per drone, tiny) ──────────────────────
function makeHPBar(scene, parent, yOffset) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.12),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
  );
  mesh.position.y = yOffset;
  mesh.visible = false;
  parent.add(mesh);
  return { mesh, ctx, tex };
}

// ── Drone class ───────────────────────────────────────────────
export class Drone {
  constructor(type, scene) {
    this.spec    = DRONE_TYPES[type];
    this.hp      = this.spec.hp;
    this.dead    = false;
    this._scene  = scene;

    this._stunTimer  = 0;
    this._scanTimer  = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    this._hpBar = makeHPBar(scene, this.group, this.spec.size * 1.3);
    scene.add(this.group);
  }

  _buildMesh() {
    const spec = this.spec;

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: spec.color });
    this._bodyMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(spec.size * 0.5, 0),
      bodyMat
    );
    this._bodyMesh.castShadow = true;
    this.group.add(this._bodyMesh);

    // Eye / sensor (glowing red dot)
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(spec.size * 0.12, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    eye.position.z = spec.size * 0.45;
    this.group.add(eye);

    // 4 arms + propellers
    const armMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const propMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const armLen = spec.armLen;

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;

      // Arm
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, armLen, 4),
        armMat
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.x = armLen / 2;
      pivot.add(arm);

      // Propeller disc
      const prop = new THREE.Mesh(
        new THREE.CircleGeometry(spec.size * 0.28, 7),
        propMat
      );
      prop.rotation.x = Math.PI / 2;
      prop.position.x = armLen;
      pivot.add(prop);

      this.group.add(pivot);
      this._propellers = this._propellers || [];
      this._propellers.push(prop);
    }

    // Scan outline (hidden by default)
    this._scanMesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.size * 0.85, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff2200, transparent: true, opacity: 0,
        wireframe: true,
      })
    );
    this.group.add(this._scanMesh);
  }

  // ── Hit ───────────────────────────────────────────────────────
  hit(damage = 1) {
    if (this.dead) return false;
    this.hp -= damage;
    this._updateHPBar();
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  // ── Stun (from EMP) ──────────────────────────────────────────
  stun(duration) {
    this._stunTimer = duration;
  }

  // ── Scan reveal ───────────────────────────────────────────────
  applyScanned(duration) {
    this._scanTimer = duration;
    this._hpBar.mesh.visible = true;
    this._scanMesh.material.opacity = 0.25;
    this._updateHPBar();
  }

  // ── Per-frame update ──────────────────────────────────────────
  // Returns distance to targetPos.
  update(dt, targetPos, camera) {
    if (this.dead) return Infinity;

    // Stun countdown
    if (this._stunTimer > 0) {
      this._stunTimer -= dt;
      this._bodyMesh.material.color.setHex(0x0066ff);
    } else {
      this._bodyMesh.material.color.setHex(this.spec.color);
    }

    // Scan countdown
    if (this._scanTimer > 0) {
      this._scanTimer -= dt;
      if (this._scanTimer <= 0) {
        this._hpBar.mesh.visible = false;
        this._scanMesh.material.opacity = 0;
      }
    }

    // Move toward target
    if (this._stunTimer <= 0) {
      const dir  = new THREE.Vector3().subVectors(targetPos, this.group.position);
      const dist = dir.length();
      dir.normalize();
      this.group.position.addScaledVector(dir, this.spec.speed * dt);

      // Hover bob
      this.group.position.y +=
        Math.sin(Date.now() * 0.0025 + this.group.position.x * 0.4) * 0.008;

      // Face direction of travel
      this.group.rotation.y = Math.atan2(dir.x, dir.z);

      // Spin propellers
      if (this._propellers) {
        for (const p of this._propellers) p.rotation.z += dt * 18;
      }

      // Billboard HP bar toward camera
      if (this._hpBar.mesh.visible && camera) {
        this._hpBar.mesh.lookAt(camera.getWorldPosition(new THREE.Vector3()));
      }

      return dist;
    }

    return this.group.position.distanceTo(targetPos);
  }

  destroy() {
    this.dead = true;
    this._scene.remove(this.group);
  }

  // ── Private ───────────────────────────────────────────────────
  _updateHPBar() {
    const { ctx, tex } = this._hpBar;
    const W = 64, H = 8;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, W, H);
    const pct = Math.max(0, this.hp / this.spec.hp);
    ctx.fillStyle = pct > 0.5 ? '#44ff44' : '#ff4400';
    ctx.fillRect(0, 0, W * pct, H);
    tex.needsUpdate = true;
  }
}
