// One Euro filter (Casiez et al. 2012) per axis + a dead zone, tuned for noisy webcam gaze
// in screen pixels. Low speed -> heavy smoothing (steady dwell); high speed -> low lag.

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

class OneEuro {
  constructor({ minCutoff, beta, dCutoff }) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = null; this.dx = 0; }
  filter(v, dt) {
    if (this.x === null) { this.x = v; return v; }
    const dv = (v - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dv - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}

export function createPointSmoother({ minCutoff = 0.5, beta = 0.01, dCutoff = 1, deadZone = 14 } = {}) {
  const fx = new OneEuro({ minCutoff, beta, dCutoff });
  const fy = new OneEuro({ minCutoff, beta, dCutoff });
  let lastT = null;
  let out = null;

  return {
    // Returns the smoothed { x, y } for a raw sample taken at time t (ms).
    filter(x, y, t) {
      const dt = lastT === null ? 1 / 30 : Math.max((t - lastT) / 1000, 1e-3);
      lastT = t;
      const sx = fx.filter(x, dt);
      const sy = fy.filter(y, dt);
      // dead zone: ignore wobble smaller than deadZone px around the held point
      if (!out || Math.hypot(sx - out.x, sy - out.y) > deadZone) out = { x: sx, y: sy };
      return out;
    },
    reset() { fx.reset(); fy.reset(); lastT = null; out = null; },
  };
}
