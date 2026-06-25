import { Drone } from './drone.js';

// Wave definitions: each wave is an array of { type, delay } entries.
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
  constructor(scene, baseCorePos) {
    this._scene       = scene;
    this._baseCorePos = baseCorePos;

    this._config      = [];   // spawn queue for current wave
    this._spawnIndex  = 0;
    this._waveTimer   = 0;
    this._complete    = true;
    this._nextTimer   = 0;    // countdown before starting next wave
    this._nextCb      = null;
  }

  // ── Start a wave ──────────────────────────────────────────────
  startWave(waveNumber) {
    this._config     = buildWaveConfig(waveNumber);
    this._spawnIndex = 0;
    this._waveTimer  = 0;
    this._complete   = false;
    this._nextTimer  = 0;
    this._nextCb     = null;
  }

  // ── Schedule next wave after a delay ─────────────────────────
  // (called by Game once all drones are dead)
  scheduleNext(callback, delaySec) {
    if (this._nextCb) return; // already scheduled
    this._nextTimer = delaySec;
    this._nextCb    = callback;
  }

  isComplete() {
    return this._complete;
  }

  // ── Per-frame update ──────────────────────────────────────────
  // Returns an array of newly spawned Drone instances.
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
    const newDrones = [];

    while (
      this._spawnIndex < this._config.length &&
      this._config[this._spawnIndex].delay <= this._waveTimer
    ) {
      newDrones.push(this._spawnDrone(this._config[this._spawnIndex].type));
      this._spawnIndex++;
    }

    // Mark wave spawning done (all entries dispatched)
    if (this._spawnIndex >= this._config.length) {
      this._complete = true;
    }

    return newDrones;
  }

  // ── Spawn one drone at a random direction ─────────────────────
  _spawnDrone(type) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 75 + Math.random() * 30;
    const drone = new Drone(type, this._scene);
    drone.group.position.set(
      Math.cos(angle) * dist,
      3.5 + Math.random() * 5,
      Math.sin(angle) * dist
    );
    return drone;
  }
}
