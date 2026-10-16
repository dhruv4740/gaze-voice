import { createInteraction } from '../../src/gaze/interaction.js';
const mk = (i, always) => ({ dataset: { action: 'k' + i }, isConnected: true, hasAttribute: (a) => always && a === 'data-gaze-always',
  getBoundingClientRect: () => ({ left: 100 + i * 240, right: 320 + i * 240, top: 250, bottom: 350 }) });
const els = [0, 1, 2, 3, 4, 5].map((i) => mk(i));
const rects = els.map((el) => { const r = el.getBoundingClientRect(); return { el, ...r }; });
const DT = 1000 / 60;
// path: list of [tSec, x, y] keyframes (linear). Returns { fires:[{t,i}], pinches }
function run(keys, { pinchAt = [], noise = 0, jump = 0, dwell = 1200 } = {}) {
  const inter = createInteraction({ dwellMs: () => dwell });
  const fires = []; let pin = 0; let t = 0; const end = keys[keys.length - 1][0] * 1000;
  let jx = 0, jy = 0, nextJ = 0;
  for (; t <= end; t += DT) {
    const s = t / 1000; let k = 0; while (k < keys.length - 2 && s > keys[k + 1][0]) k++;
    const [t0, x0, y0] = keys[k], [t1, x1, y1] = keys[k + 1]; const u = Math.min(1, Math.max(0, (s - t0) / (t1 - t0 || 1)));
    if (jump && t >= nextJ) { jx = (Math.random() - 0.5) * 2 * jump; jy = (Math.random() - 0.5) * 2 * jump; nextJ = t + 100; }
    const p = { x: x0 + (x1 - x0) * u + jx + (Math.random() - 0.5) * noise, y: y0 + (y1 - y0) * u + jy };
    const f = inter.frame(p, rects, t);
    if (f.r.fired && inter.accept(f.r.fired, t)) fires.push({ t: Math.round(t), i: els.indexOf(f.r.fired) });
    if (pinchAt.some((pt) => Math.abs(pt * 1000 - t) < DT / 2)) { const el = inter.pinchTarget(t); if (el && inter.accept(el, t)) { pin++; fires.push({ t: Math.round(t), i: els.indexOf(el), pinch: 1 }); } }
  }
  return { fires, inter };
}
let bad = 0; const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, extra); if (!ok) bad = 1; };
const y = 300;
for (const v of [2500, 1500, 800, 500, 350]) { // px/s sweeps across all 6 tiles (x 100..1540)
  const dur = 1440 / v; const r = run([[0, 60, y], [dur, 1500, y], [dur + 0.3, 1500, y]]);
  check(`sweep ${v}px/s over 6 tiles: 0 selections`, r.fires.length === 0, JSON.stringify(r.fires));
}
let r = run([[0, 60, y], [0.3, 210, y], [2.3, 210, y]], { noise: 3 });
check('stable 2 s on one tile (hand tremor 3px): 1 selection', r.fires.length === 1 && r.fires[0].i === 0, JSON.stringify(r.fires));
r = run([[0, 60, y], [0.3, 450, y], [3, 450, y]], { jump: 30 });
check('stable with 30px head-style jumps every 100ms: 1 selection', r.fires.length === 1 && r.fires[0].i === 1, JSON.stringify(r.fires));
r = run([[0, 60, y], [0.3, 210, y], [1.1, 210, y]]);
check('held only 0.8 s (< lock 0.3 + dwell 1.2): 0 selections', r.fires.length === 0);
r = run([[0, 210, y], [0.5, 210, y], [1.3, 210, y], [3, 210, y]], { pinchAt: [0.6, 1.2] });
check('double pinch inside 1.5 s = 1 selection', r.fires.filter((f) => f.pinch).length === 1 && r.fires.length === 1, JSON.stringify(r.fires));
r = run([[0, 210, y], [0.2, 210, y]], { pinchAt: [0.1] });
check('pinch before lock-on (0.1 s) selects nothing', r.fires.length === 0);
r = run([[0, 210, y], [2.0, 210, y], [2.3, 690, y], [6, 690, y]]);
const gap = r.fires.length === 2 ? r.fires[1].t - r.fires[0].t : -1;
check('dwell A then B: second only >= 1.5 s after first', r.fires.length === 2 && gap >= 1500, `gap ${gap} ms ${JSON.stringify(r.fires)}`);
r = run([[0, 210, y], [3.5, 210, y]]);
check('staying on A after selecting does not repeat', r.fires.length === 1, JSON.stringify(r.fires));
const i2 = createInteraction(); i2.accept(els[0], 0);
check('always-on element exempt from refractory', i2.accept(mk(9, true), 100) && !i2.accept(els[1], 200));
process.exitCode = bad;
// in-place update (Team B): same element, its text/value changes right after a selection
{
  const inter = createInteraction(); const el = els[0]; const fires = []; let mutated = false;
  for (let t = 0; t <= 5000; t += DT) {
    const f = inter.frame({ x: 210, y: 300 }, rects, t);
    if (f.r.fired && inter.accept(f.r.fired, t)) { fires.push(Math.round(t)); if (!mutated) { el.dataset.value = 'new text'; el.textContent = 'new'; mutated = true; } }
  }
  check('in-place text change after selection: no instant reselect (1 selection in 5 s)', fires.length === 1, JSON.stringify(fires));
}
