import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

// Shared geometries / materials (created once, reused).
const _geo = new THREE.SphereGeometry(0.06, 4, 3);

const _mats = {
  fire:  new THREE.MeshBasicMaterial({ color: 0xff5500 }),
  spark: new THREE.MeshBasicMaterial({ color: 0xffdd00 }),
  emp:   new THREE.MeshBasicMaterial({ color: 0x00ccff }),
  scan:  new THREE.MeshBasicMaterial({ color: 0xff2200 }),
  smoke: new THREE.MeshBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.5 }),
};

class Particle {
  constructor(scene, position, type, speed) {
    this.scene = scene;
    this.mesh  = new THREE.Mesh(_geo, _mats[type] ?? _mats.fire);
    this.mesh.position.copy(position);
    this.vel = new THREE.Vector3(
      (Math.random() - 0.5) * speed,
      (Math.random() * 0.6 + 0.2) * speed,
      (Math.random() - 0.5) * speed
    );
    this.life = 1.0;
    scene.add(this.mesh);
  }

  update(dt) {
    this.life -= dt * 2.2;
    this.vel.y -= 9 * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    this.mesh.scale.setScalar(Math.max(0, this.life));
    return this.life > 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

class Tracer {
  constructor(scene, from, to) {
    const points = [from.clone(), to.clone()];
    const geo    = new THREE.BufferGeometry().setFromPoints(points);
    const mat    = new THREE.LineBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.85,
    });
    this.line  = new THREE.Line(geo, mat);
    this.life  = 0.10;
    this.maxLife = 0.10;
    scene.add(this.line);
    this._scene = scene;
  }

  update(dt) {
    this.life -= dt;
    this.line.material.opacity = Math.max(0, (this.life / this.maxLife) * 0.85);
    return this.life > 0;
  }

  dispose() {
    this._scene.remove(this.line);
    this.line.geometry.dispose();
  }
}

export class ParticleSystem {
  constructor(scene) {
    this._scene     = scene;
    this._particles = [];
    this._tracers   = [];
  }

  // Emit particles at a world position.
  // type: 'fire' | 'spark' | 'emp' | 'scan' | 'smoke'
  emit(position, type = 'fire', count = 8, speed = 6) {
    for (let i = 0; i < count; i++) {
      this._particles.push(new Particle(this._scene, position, type, speed));
    }
  }

  // Add a bullet tracer from world-point A to world-point B.
  addTracer(from, to) {
    this._tracers.push(new Tracer(this._scene, from, to));
  }

  update(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      if (!this._particles[i].update(dt)) {
        this._particles[i].dispose();
        this._particles.splice(i, 1);
      }
    }
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      if (!this._tracers[i].update(dt)) {
        this._tracers[i].dispose();
        this._tracers.splice(i, 1);
      }
    }
  }
}
