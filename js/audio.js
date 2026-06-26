// Procedural sound effects via Web Audio API.
// All sounds are synthesized — no external files needed.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this._rainSrc  = null;
    this._rainGain = null;
  }

  // Must be called from a user-gesture handler (click / keydown).
  async init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.initialized = true;
    this._emptyBuf  = null;
    this._reloadBuf = null;
    this._loadBuf('assets/Soundeffects/empty-gun.mp3').then(b  => { this._emptyBuf  = b; });
    this._loadBuf('assets/Soundeffects/gun-reload.mp3').then(b => { this._reloadBuf = b; });
  }

  async _loadBuf(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) {
      console.warn('[Audio] failed to load', url, e);
      return null;
    }
  }

  _playBuf(buf, gain = 0.7, pitch = 0) {
    const src = this.ctx.createBufferSource();
    const g   = this.ctx.createGain();
    src.buffer = buf;
    if (pitch) src.playbackRate.value = 1 - pitch + Math.random() * pitch * 2;
    g.gain.value = gain;
    src.connect(g); g.connect(this.ctx.destination);
    src.start();
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

  // ── Empty-magazine click ─────────────────────────────────────
  emptyGun() {
    if (!this.initialized) return;
    this._resume();
    if (this._emptyBuf) {
      this._playBuf(this._emptyBuf, 0.75, 0.05);
    } else {
      const ctx = this.ctx, t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 80;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.045);
    }
  }

  // ── Reload ────────────────────────────────────────────────────
  gunReload() {
    if (!this.initialized) return;
    this._resume();
    if (this._reloadBuf) {
      this._playBuf(this._reloadBuf, 0.75);
    } else {
      const ctx = this.ctx;
      for (let i = 0; i < 3; i++) {
        const t = ctx.currentTime + i * 0.13;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180 - i * 25, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.09);
      }
    }
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

  // ── Rain (synthesized white-noise) ───────────────────────────
  startRain() {
    if (!this.initialized || this._rainGain) return;
    this._resume();
    const ctx = this.ctx;
    const sr  = ctx.sampleRate;

    const buf = ctx.createBuffer(1, sr * 2, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this._rainSrc  = ctx.createBufferSource();
    this._rainSrc.buffer = buf;
    this._rainSrc.loop   = true;

    const hi = ctx.createBiquadFilter();
    hi.type = 'highpass'; hi.frequency.value = 300;
    const lo = ctx.createBiquadFilter();
    lo.type = 'lowpass';  lo.frequency.value = 8000;

    this._rainGain = ctx.createGain();
    this._rainGain.gain.value = 0;

    this._rainSrc.connect(hi); hi.connect(lo); lo.connect(this._rainGain);
    this._rainGain.connect(ctx.destination);
    this._rainSrc.start();
    this._rainGain.gain.linearRampToValueAtTime(0.072, ctx.currentTime + 3.0);
  }

  stopRain() {
    if (!this._rainGain) return;
    const ctx = this.ctx;
    this._rainGain.gain.cancelScheduledValues(ctx.currentTime);
    this._rainGain.gain.setValueAtTime(this._rainGain.gain.value, ctx.currentTime);
    this._rainGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);
    const src = this._rainSrc, gain = this._rainGain;
    this._rainSrc = null; this._rainGain = null;
    setTimeout(() => { try { src?.stop(); } catch (_) {} }, 2500);
  }

  // ── Thunder (synthesized crack + rumble) ──────────────────────
  thunder() {
    if (!this.initialized) return;
    this._resume();
    const ctx = this.ctx, t = ctx.currentTime;

    // Sharp crack
    const crackBuf = this._noiseBuffer(0.12);
    const crackSrc  = ctx.createBufferSource();
    const crackFilt = ctx.createBiquadFilter();
    const crackGain = ctx.createGain();
    crackFilt.type = 'bandpass'; crackFilt.frequency.value = 600; crackFilt.Q.value = 0.4;
    crackSrc.buffer = crackBuf;
    crackGain.gain.setValueAtTime(0.9, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    crackSrc.connect(crackFilt); crackFilt.connect(crackGain); crackGain.connect(ctx.destination);
    crackSrc.start(t);

    // Rolling deep rumble
    const rumbleBuf  = this._noiseBuffer(4.0);
    const rumbleSrc  = ctx.createBufferSource();
    const rumbleFilt = ctx.createBiquadFilter();
    const rumbleGain = ctx.createGain();
    rumbleFilt.type = 'lowpass'; rumbleFilt.frequency.value = 100;
    rumbleSrc.buffer = rumbleBuf;
    rumbleGain.gain.setValueAtTime(0, t + 0.04);
    rumbleGain.gain.linearRampToValueAtTime(0.75, t + 0.20);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 4.0);
    rumbleSrc.connect(rumbleFilt); rumbleFilt.connect(rumbleGain); rumbleGain.connect(ctx.destination);
    rumbleSrc.start(t);
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
