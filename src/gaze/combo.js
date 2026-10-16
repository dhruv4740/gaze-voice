// Combined input: face (head or iris) and hand landmarkers on ONE shared camera stream, running
// on alternate frames. Both report points tagged with their source; the caller decides which wins.
// The face tracker is the calibrated one, so record/fit/learn/... are forwarded to it.
import { createSharedCamera } from './camera.js';
import { createHandTracker } from './hand.js';
import { createHeadTracker } from './head.js';
import { createIrisTracker } from './iris.js';

export function createComboTracker({ face = 'head', onPoint, onStatus, onPinch, onBlink }) {
  const camera = createSharedCamera();
  const mk = face === 'iris' ? createIrisTracker : createHeadTracker;
  const faceT = mk({ onPoint: (x, y) => onPoint(x, y, 'face'), onStatus: (s) => onStatus?.(s, 'face'), onBlink, camera });
  const handT = createHandTracker({ onPoint: (x, y) => onPoint(x, y, 'hand'), onStatus: (s) => onStatus?.(s, 'hand'), onPinch, camera });
  return {
    async start() {
      await camera.open();
      try { await Promise.all([faceT.start(), handT.start()]); } catch (e) { camera.close(); throw e; }
      camera.begin();
    },
    stop() { faceT.stop(); handT.stop(); camera.close(); },
    record: (...a) => faceT.record(...a),
    reset: () => faceT.reset(),
    resetLearning: () => faceT.resetLearning(),
    fit: () => faceT.fit(),
    learn: (...a) => faceT.learn(...a),
    count: () => faceT.count(),
    meanSince: (...a) => faceT.meanSince(...a),
    trim: (...a) => faceT.trim(...a),
  };
}
