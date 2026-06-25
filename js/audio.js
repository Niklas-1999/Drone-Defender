// Procedural sound effects via Web Audio API.
// All sounds are synthesized — no external files needed.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;
  }

  // Must be called from a user-gesture handler (click / keydown).
  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.initialized = true;
  }

  // Resume if suspended (browsers pause on focus loss).
  _resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  _noiseBuffer(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── Gunshot ──────────────────────────────────────────────────
  shoot() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.14);

    const ns = ctx.createBufferSource();
    const nsGain = ctx.createGain();
    ns.buffer = this._noiseBuffer(0.08);
    nsGain.gain.setValueAtTime(0.35, t);
    nsGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    ns.connect(nsGain); nsGain.connect(ctx.destination);
    ns.start(t);
  }

  // ── Hit / impact ─────────────────────────────────────────────
  hit() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.07);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.07);
  }

  // ── Explosion ─────────────────────────────────────────────────
  explosion(size = 1) {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 0.25 + size * 0.25;

    const ns     = ctx.createBufferSource();
    const nsGain = ctx.createGain();
    ns.buffer = this._noiseBuffer(dur);

    // Shape like a boom
    nsGain.gain.setValueAtTime(0, t);
    nsGain.gain.linearRampToValueAtTime(0.5 * size, t + 0.01);
    nsGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    // Low-pass for boom feel
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);

    ns.connect(filter); filter.connect(nsGain); nsGain.connect(ctx.destination);
    ns.start(t);
  }

  // ── EMP pulse ─────────────────────────────────────────────────
  emp() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.6);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.6);
  }

  // ── Ability activate ─────────────────────────────────────────
  abilityActivate() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(660, t + 0.05);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.18);
  }

  // ── Wave start jingle ─────────────────────────────────────────
  waveStart() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx;
    const freqs = [330, 440, 550];
    freqs.forEach((f, i) => {
      const t    = ctx.currentTime + i * 0.12;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    });
  }

  // ── Base hit alarm ────────────────────────────────────────────
  baseHit() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.3);
  }
}
