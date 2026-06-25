export class EMP {
  constructor() {
    this.unlocked      = false;
    this.cooldownMax   = 15;   // seconds between uses
    this.stunDuration  = 1.0;  // seconds drones are frozen
    this._cooldownT    = 0;    // countdown to ready
  }

  update(dt) {
    if (this._cooldownT > 0) this._cooldownT = Math.max(0, this._cooldownT - dt);
  }

  canActivate() { return this.unlocked && this._cooldownT === 0; }

  activate(drones) {
    if (!this.canActivate()) return false;
    this._cooldownT = this.cooldownMax;
    for (const d of drones) {
      if (!d.dead) d.stun(this.stunDuration);
    }
    return true;
  }

  // 0 = on cooldown / locked, 1 = ready
  get readyFraction() {
    if (!this.unlocked) return 0;
    if (this._cooldownT === 0) return 1;
    return 1 - this._cooldownT / this.cooldownMax;
  }

  get cooldownRemaining() { return this._cooldownT; }
}
