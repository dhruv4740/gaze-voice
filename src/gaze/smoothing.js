// Median of the last few raw samples (outliers) -> One Euro filter (Casiez et al. 2012)
// per axis -> dead zone, tuned for noisy webcam gaze in screen pixels.
// Low speed -> heavy smoothing (steady dwell); high speed -> lower lag.

// ---- tuning (px, Hz) ----
export const MEDIAN_N = 5; // default raw samples in the outlier-rejecting median (a preset's `median` overrides)
export const PRESETS = {
  //          minCutoff: still-pointer smoothing (lower = steadier, slower)
  //          beta: speed coefficient (higher = follows fast moves sooner)
  //          deadZone: ignore wobble smaller than this around the held point
  eyes: { minCutoff: 0.15, beta: 0.004, dCutoff: 1, deadZone: 30 },
  iris: { minCutoff: 0.1, beta: 0.003, dCutoff: 1, deadZone: 35 },
  hand: { minCutoff: 1.5, beta: 0.02, dCutoff: 1, deadZone: 10, median: 3 }, // midair fingertip tremor is ~25 px on a keyboard: smooth more than a mouse (sim: scripts/sim/handkeys.mjs)
  head: { minCutoff: 0.1, beta: 0.003, dCutoff: 1, deadZone: 35 },
};

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


const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };

export function createPointSmoother({ minCutoff, beta, dCutoff, deadZone, median: medN = MEDIAN_N } = PRESETS.head) {
  const fx = new OneEuro({ minCutoff, beta, dCutoff });
  const fy = new OneEuro({ minCutoff, beta, dCutoff });
  let lastT = null;
  let out = null;
  let hx = [];
  let hy = [];

  return {
    // Returns the smoothed { x, y } for a raw sample taken at time t (ms).
    filter(x, y, t) {
      const dt = lastT === null ? 1 / 30 : Math.max((t - lastT) / 1000, 1e-3);
      lastT = t;
      hx.push(x); hy.push(y);
      if (hx.length > medN) { hx.shift(); hy.shift(); }
      const sx = fx.filter(median(hx), dt);
      const sy = fy.filter(median(hy), dt);
      // dead zone: ignore wobble smaller than deadZone px around the held point
      if (!out || Math.hypot(sx - out.x, sy - out.y) > deadZone) out = { x: sx, y: sy };
      return out;
    },
    reset() { fx.reset(); fy.reset(); lastT = null; out = null; hx = []; hy = []; },
  };
}
