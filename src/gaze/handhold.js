// Pinch hold for the hand pointer. While the fingers close the fingertip drifts, which used to drag
// the pointer onto the next key. Keep a short history of the raw fingertip; when the pointer freezes
// (fingers starting to close) rewind to where it was `rewindMs` earlier and stay there until the
// fingers open again.
export function createHold({ rewindMs = 250, keepMs = 800 } = {}) {
  let hist = []; let held = null;
  return {
    // returns the point to feed the smoother
    update(x, y, now, frozen) {
      if (!frozen) {
        held = null;
        hist.push({ x, y, t: now });
        while (hist.length && now - hist[0].t > keepMs) hist.shift();
        return { x, y };
      }
      if (!held) {
        // average the samples around (now - rewindMs): steadier than one noisy frame
        const lo = now - rewindMs - 120; const hi = now - rewindMs;
        const pick = hist.filter((h) => h.t >= lo && h.t <= hi);
        const src = rewindMs > 0 && pick.length ? pick : hist.slice(-1);
        held = src.length ? { x: src.reduce((s, h) => s + h.x, 0) / src.length, y: src.reduce((s, h) => s + h.y, 0) / src.length } : { x, y };
      }
      return held;
    },
    reset() { hist = []; held = null; },
  };
}
