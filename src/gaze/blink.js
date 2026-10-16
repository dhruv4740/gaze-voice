// Deliberate-blink detector for MediaPipe blendshape scores (eyeBlinkLeft/Right, 0..1).
// Both eyes closed for >= minMs fires once; the eyes must open before it can fire again,
// so ordinary blinks (~100-300 ms) are ignored.
export function createBlinkDetector({ onLongBlink, onChange, threshold = 0.5, minMs = 400 }) {
  let closedSince = null;
  let fired = false;
  return {
    update(left, right, t) {
      const closed = left > threshold && right > threshold;
      if (closed) {
        if (closedSince === null) { closedSince = t; onChange?.(true); }
        if (!fired && t - closedSince >= minMs) { fired = true; onLongBlink(); }
      } else if (closedSince !== null) {
        closedSince = null; fired = false; onChange?.(false);
      }
    },
    reset() { closedSince = null; fired = false; },
  };
}
