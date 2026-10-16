// Selection safety, pure logic (no DOM) so it can be simulated with fake rects:
//  - gate:  a dwell may start only once the snapped target has been stable for LOCK_MS AND the
//           pointer is slow (< SPEED_MAX px/s over the last ~200 ms). Fast sweeps never dwell.
//  - snapping freezes while the pointer is fast (stay on the current target, or none)
//  - refractory: after any selection nothing else is selected for a while (always-on and
//    no-learn elements, i.e. emergency and Wake, are exempt)
import { createTargeter, createDwell, sigOf, sameSpot } from './select.js';

export const LOCK_MS = 300;
export const SPEED_MAX = 400; // px/s
export const REFRACTORY_MS = 1500;
const SPEED_WINDOW_MS = 200;

export function createGate({ lockMs = LOCK_MS, speedMax = SPEED_MAX } = {}) {
  let hist = []; let speed = 0;
  let stableEl = null; let stableSig = null; let since = 0;
  return {
    // call once per frame with the smoothed pointer
    move(p, now) {
      if (p.x < 0) { hist = []; speed = 0; return; }
      hist.push({ x: p.x, y: p.y, t: now });
      while (hist.length > 1 && now - hist[0].t > SPEED_WINDOW_MS) hist.shift();
      const a = hist[0]; const span = now - a.t;
      if (span >= 50) speed = Math.hypot(p.x - a.x, p.y - a.y) / (span / 1000);
    },
    get speed() { return speed; },
    heldMs: (now) => now - since, // how long the current target has been stable and slow
    get fast() { return speed >= speedMax; },
    // returns the target once it is locked on (stable and slow), else null
    lock(target, now) {
      const same = target && stableEl && (target === stableEl || (!stableEl.isConnected && sameSpot(stableSig, target)));
      if (!target || !same || speed >= speedMax) { since = now; }
      stableEl = target; stableSig = sigOf(target);
      return target && now - since >= lockMs ? target : null;
    },
  };
}

export function createInteraction({ dwellMs = () => 1200, refractoryMs = () => REFRACTORY_MS, lockMs, speedMax, targeter: targeterOpts } = {}) {
  const targeter = createTargeter(targeterOpts);
  const dwell = createDwell();
  const gate = createGate({ lockMs, speedMax });
  let lastAt = -Infinity; let lockedEl = null;
  const cooling = (now) => now - lastAt < refractoryMs();
  return {
    targeter, dwell, gate, cooling,
    coolLeft: (now) => Math.max(0, refractoryMs() - (now - lastAt)),
    // One frame. `hit` (optional) replaces snapping, `quiet` blocks targeting.
    frame(point, rects, now, { hit, quiet } = {}) {
      gate.move(point, now);
      let target = hit !== undefined ? hit : targeter.update(point, rects, now, gate.fast);
      if (quiet) target = null;
      lockedEl = gate.lock(target, now);
      const cool = cooling(now);
      // a just-selected tile stays locked in the dwell until the pointer leaves it
      const feed = (lockedEl && !cool) || dwell.holds(target) ? target : null;
      const r = dwell.update(feed, now, dwellMs);
      const hl = r.el || (target && !cool && !dwell.holds(target) ? target : null);
      return { target, hl, r, fast: gate.fast, cooling: cool, locked: lockedEl };
    },
    // the element a pinch may select right now: only when locked on and not cooling down
    pinchTarget(now) { return lockedEl && !cooling(now) ? lockedEl : null; },
    // every selection goes through here; false = dropped (refractory)
    accept(el, now) {
      const exempt = el.hasAttribute?.('data-gaze-always') || el.hasAttribute?.('data-no-learn');
      if (!exempt && cooling(now)) return false;
      lastAt = now;
      return true;
    },
  };
}
