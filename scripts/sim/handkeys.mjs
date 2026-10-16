// Hand pointer on a dense on-screen keyboard (40 keys, ~118x110 px). Models what the user saw:
// fingertip tremor + landmark noise while aiming, then the fingers closing for a pinch drags the
// fingertip ~35 px. Runs the real smoother, targeter/gate and (optionally) the pinch hold.
// Reports, per 100 attempts: wrong key, no lock (pinch ignored), and the same for dwell-only.
import { createPointSmoother, PRESETS } from '../../src/gaze/smoothing.js';
import { createInteraction } from '../../src/gaze/interaction.js';
import { createHold } from '../../src/gaze/handhold.js';

const W = 1366; const COLS = 10; const ROWS = 4; const KW = 118; const KH = 110; const GAP = 8;
const x0 = (W - (COLS * KW + (COLS - 1) * GAP)) / 2;
const mkRects = () => {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const left = x0 + c * (KW + GAP); const top = 150 + r * (KH + GAP);
    const box = { left, top, right: left + KW, bottom: top + KH };
    const el = { id: r * COLS + c, isConnected: true, dataset: { action: 'type-key', value: String(r * COLS + c) }, getBoundingClientRect: () => box };
    out.push({ el, ...box });
  }
  return out;
};
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// cfg: { preset, hold:{rewindMs, freezeFrac}, tremor, white, drift }
export function run({ preset, rewindMs = 0, freezeFrac = 0.4, tremor = 14, white = 5, drift = 35, mode = 'pinch', tgt, attempts = 60, trials = 6 } = {}) {
  const rects = mkRects(); const DT = 33; // ~30 fps camera
  let wrong = 0; let miss = 0; let total = 0; const times = [];
  for (let t = 0; t < trials; t++) {
    const sm = createPointSmoother(preset); const inter = createInteraction({ dwellMs: () => 1200, targeter: tgt });
    const hold = createHold({ rewindMs });
    let now = 0; let cur = rects[15]; let tx = 0; let ty = 0;
    let pos = { x: (cur.left + cur.right) / 2, y: (cur.top + cur.bottom) / 2 };
    for (let a = 0; a < attempts; a++) {
      let want; do { want = rects[Math.floor(rnd() * rects.length)]; } while (want === cur);
      const from = { ...pos }; const aim = { x: (want.left + want.right) / 2 + g() * 12, y: (want.top + want.bottom) / 2 + g() * 12 };
      const MOVE = 400; const SETTLE = mode === 'pinch' ? 900 : 3000; const CLOSE = 300;
      const ang = rnd() * 2 * Math.PI; const dx = Math.cos(ang) * drift; const dy = Math.sin(ang) * drift;
      const tEnd = MOVE + SETTLE + (mode === 'pinch' ? CLOSE : 0);
      let fired = null; const t0 = now; let pinchEl = null;
      for (let el = 0; el <= tEnd + 2 * DT && !fired; el += DT) {
        now += DT;
        const k = Math.min(el / MOVE, 1); const e = k * k * (3 - 2 * k);
        let px = from.x + (aim.x - from.x) * e; let py = from.y + (aim.y - from.y) * e;
        let ratio = 1.2; // open hand
        if (mode === 'pinch' && el > MOVE + SETTLE) { // fingers closing: ratio 1.2 -> 0.25 over CLOSE ms, fingertip drifts
          const q = (el - MOVE - SETTLE) / CLOSE; ratio = 1.2 - 0.95 * Math.min(q, 1); px += dx * q; py += dy * q;
        }
        tx = tx * 0.9 + g() * tremor * 0.44; ty = ty * 0.9 + g() * tremor * 0.44; // AR(1) tremor, sd ~ tremor
        const rawx = px + tx + g() * white; const rawy = py + ty + g() * white;
        const frozen = ratio < freezeFrac * 0 + (freezeFrac); // freezeFrac is the PINCH_FREEZE ratio
        const h = hold.update(rawx, rawy, now, frozen);
        const p = sm.filter(h.x, h.y, now);
        const f = inter.frame(p, rects, now);
        if (mode === 'dwell') { if (f.r.fired && inter.accept(f.r.fired, now)) fired = f.r.fired; }
        else if (ratio < 0.3) { pinchEl = inter.pinchTarget(now); if (pinchEl) { inter.accept(pinchEl, now); fired = pinchEl; } break; }
      }
      total++;
      if (!fired) miss++; else if (fired !== want.el) wrong++; else times.push(now - t0);
      cur = want; pos = { x: aim.x, y: aim.y }; now += 1600; // refractory + rest
    }
  }
  const pc = (n) => (n / total * 100).toFixed(1);
  return { wrong: pc(wrong), noLock: pc(miss), medianMs: times.sort((a, b) => a - b)[times.length >> 1] };
}

if ((process.argv[1] || '').endsWith('handkeys.mjs')) {
  const OLD = { minCutoff: 4, beta: 0.1, dCutoff: 1, deadZone: 3, median: 1 };
  const cases = [
    ['before (old hand preset, no rewind)', { preset: OLD, rewindMs: 0 }],
    ['after  (shipped preset + 250 ms rewind)', { preset: PRESETS.hand, rewindMs: 250 }],
  ];
  for (const [tr, dr] of [[25, 50], [35, 60]]) {
    console.log(`-- tremor sd ${tr} px, pinch drift ${dr} px (per 100 attempts)`);
    for (const mode of ['pinch', 'dwell']) for (const [name, cfg] of cases) console.log(mode.padEnd(5), name.padEnd(42), run({ ...cfg, freezeFrac: 0.7, tremor: tr, drift: dr, mode }));
  }
}
