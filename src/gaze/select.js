// Target snapping + dwell. Pure logic (no DOM) so it can be unit-tested with fake rects.

// ---- tuning ----
export const SNAP_PX = 150; // snap to a target only if its rect is within this distance
export const SWITCH_MARGIN_PX = 60; // another target must be this much closer to take over...
export const SWITCH_MS = 200; // ...for this long (the challenger must lead this long at low speed)
export const GRACE_MS = 300; // a slip off the target shorter than this keeps dwell progress

const distToRect = (p, r) => {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  return Math.hypot(dx, dy);
};

// rects: [{ el, left, top, right, bottom }]. Returns the snapped element or null.
// Snap radius and switch margin shrink with dense targets (a keyboard of ~120 px keys), so the
// point never snaps past a neighbouring key: snap <= 0.75 x the typical target size.
export function scaledSnap(rects, snap = SNAP_PX, margin = SWITCH_MARGIN_PX) {
  if (!rects.length) return { snap, margin };
  const sizes = rects.map((r) => Math.sqrt((r.right - r.left) * (r.bottom - r.top))).sort((a, b) => a - b);
  const s = Math.min(snap, 0.75 * sizes[sizes.length >> 1]);
  return { snap: s, margin: Math.min(margin, s * (margin / snap)) };
}

export function createTargeter({ snap: SNAP = SNAP_PX, margin: MARGIN = SWITCH_MARGIN_PX, switchMs = SWITCH_MS } = {}) {
  let cur = null;
  let challenger = null;
  let challengerSince = 0;

  return {
    // `fast`: the pointer is sweeping. Snapping freezes: keep the current target (or none).
    update(point, rects, now, fast = false) {
      if (point.x < 0 || !rects.length) { cur = null; challenger = null; return null; }
      if (fast) { challenger = null; if (cur && !rects.some((r) => r.el === cur)) cur = null; return cur; }
      const { snap, margin } = scaledSnap(rects, SNAP, MARGIN);
      let best = null; let bestD = Infinity; let curD = Infinity;
      for (const r of rects) {
        const d = distToRect(point, r);
        if (d < bestD) { best = r; bestD = d; }
        if (cur && r.el === cur) curD = d;
      }
      if (bestD > snap) { cur = null; challenger = null; return null; }
      if (!cur || curD > snap) { cur = best.el; challenger = null; return cur; }
      if (best.el === cur) { challenger = null; return cur; }
      // clearly closer (or the point is inside the other one and not inside ours)
      const clearer = curD - bestD > margin || (bestD === 0 && curD > 0);
      if (!clearer) { challenger = null; return cur; }
      if (challenger !== best.el) { challenger = best.el; challengerSince = now; }
      else if (now - challengerSince >= switchMs) { cur = best.el; challenger = null; }
      return cur;
    },
    center(el, rects) {
      const r = rects.find((q) => q.el === el);
      return r ? { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 } : null;
    },
  };
}

// Dwell on the targeter's element. Progress accumulates only while on target, and a slip
// shorter than graceMs freezes it instead of resetting. After a selection the user must
// look away (a different target, or none past the grace time) before it can fire again.
// Team B re-renders the whole tile grid on most state changes, so the element we were
// dwelling on (or just selected) is replaced by a fresh copy at the same place. Match a
// new element to the old one by action + value + position instead of identity.
const SAME_SPOT_PX = 30;
export const sigOf = (el) => {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  return { a: el.dataset?.action || '', v: el.dataset?.value || '', x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
};
export const sameSpot = (sig, el) => {
  const t = sig && sigOf(el);
  return !!t && t.a === sig.a && t.v === sig.v && Math.hypot(t.x - sig.x, t.y - sig.y) < SAME_SPOT_PX;
};

export function createDwell({ graceMs = GRACE_MS, defaultMs = 1200 } = {}) {
  let el = null;
  let acc = 0;
  let lastOn = 0;
  let locked = null;
  let lockedSig = null;
  let elSig = null;
  let last = null;

  return {
    // Returns { el, progress, fired }. el is the element currently being dwelled on.
    update(target, now, dwellMsOf) {
      const dt = last === null ? 0 : Math.min(now - last, 100);
      last = now;
      // the grid was re-rendered: carry the lock / progress over to the replacement element
      if (locked && target && target !== locked && !locked.isConnected && sameSpot(lockedSig, target)) locked = target;
      if (el && target && target !== el && !el.isConnected && sameSpot(elSig, target)) el = target;
      if (locked && target !== locked) locked = null;
      if (target && target === locked) target = null;
      if (target && target === el) {
        acc += dt; lastOn = now;
      } else if (el && now - lastOn <= graceMs) {
        // slipping: keep el and its progress, ignore other targets until grace runs out
      } else {
        el = target; acc = 0; lastOn = now;
      }
      if (!el) return { el: null, progress: 0, fired: null };
      if (el === target) elSig = sigOf(el);
      const progress = Math.min(acc / (dwellMsOf(el) || defaultMs), 1);
      if (progress >= 1) {
        const done = el; locked = done; lockedSig = sigOf(done); el = null; acc = 0;
        return { el: null, progress: 0, fired: done };
      }
      return { el, progress, fired: null };
    },
    // is `target` the element just selected (still locked until the pointer leaves it)?
    holds(target) {
      return !!target && !!locked && (target === locked || (!locked.isConnected && sameSpot(lockedSig, target)));
    },
    // Blink: select the element being dwelled on right now.
    select() {
      const done = el;
      if (done) { locked = done; lockedSig = sigOf(done); el = null; acc = 0; }
      return done;
    },
    get el() { return el; },
  };
}
