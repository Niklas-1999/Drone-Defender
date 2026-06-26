import { Drone } from './drone.js';

// Drones spawn in a forward arc (±65° from player's -Z look direction).
const HALF_ARC = 52 * (Math.PI / 180); // 20 % narrower than original 65°

function buildBossWaveConfig() {
  return [{ type: 'scout', delay: 0 }]; // placeholder: 1 scout
}

function buildWaveConfig(waveNumber) {
  const w = waveNumber;
  const config = [];

  const scouts   = Math.min(3 + w * 3, 22);
  const warriors = Math.max(0, Math.floor((w - 1) * 1.6));
  const titans   = Math.max(0, w - 3);

  for (let i = 0; i < scouts;   i++) config.push({ type: 'scout',   delay: i * 0.9 });
  for (let i = 0; i < warriors; i++) config.push({ type: 'warrior', delay: 1.5 + i * 1.8 });
  for (let i = 0; i < titans;   i++) config.push({ type: 'titan',   delay: 3.0 + i * 4 });

  config.sort((a, b) => a.delay - b.delay);
  return config;
}

export class WaveManager {
  constructor(scene) {
    this._scene      = scene;
    this._config     = [];
    this._spawnIndex = 0;
    this._waveTimer  = 0;
    this._complete   = true;
    this._nextTimer  = 0;
    this._nextCb     = null;
  }

  startWave(waveNumber) {
    this._config     = buildWaveConfig(waveNumber);
    this._spawnIndex = 0;
    this._waveTimer  = 0;
    this._complete   = false;
    this._nextTimer  = 0;
    this._nextCb     = null;
  }

  startBossWave() {
    this._config     = buildBossWaveConfig();
    this._spawnIndex = 0;
    this._waveTimer  = 0;
    this._complete   = false;
    this._nextTimer  = 0;
    this._nextCb     = null;
  }

  scheduleNext(callback, delaySec) {
    if (this._nextCb) return;
    this._nextTimer = delaySec;
    this._nextCb    = callback;
  }

  isComplete() { return this._complete; }

  update(dt) {
    if (this._nextCb) {
      this._nextTimer -= dt;
      if (this._nextTimer <= 0) {
        const cb = this._nextCb;
        this._nextCb = null;
        cb();
      }
      return [];
    }

    if (this._complete) return [];

    this._waveTimer += dt;
    const spawned = [];

    while (
      this._spawnIndex < this._config.length &&
      this._config[this._spawnIndex].delay <= this._waveTimer
    ) {
      spawned.push(this._spawnDrone(this._config[this._spawnIndex].type));
      this._spawnIndex++;
    }

    if (this._spawnIndex >= this._config.length) this._complete = true;
    return spawned;
  }

  _spawnDrone(type) {
    // Random angle within forward arc
    const angle = (Math.random() - 0.5) * HALF_ARC * 2;
    const dist  = 45 + Math.random() * 25;

    // Forward = -Z, so x = sin(angle)*dist, z = -cos(angle)*dist
    const drone = new Drone(type, this._scene);
    drone.group.position.set(
      Math.sin(angle) * dist,
      3.5 + Math.random() * 4,
      -Math.cos(angle) * dist
    );
    return drone;
  }
}
