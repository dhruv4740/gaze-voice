// WebGazer.js (GPLv3, Brown HCI) eye tracker. Frames stay in the browser; the only
// network use is WebGazer's own model download. Mouse training is disabled: we feed
// it calibration clicks explicitly via record().
import webgazer from 'webgazer';

const LOST_AFTER_MS = 800;
const FACE_MESH_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619';

export function createEyesTracker({ onPoint, onStatus, preview = true }) {
  let started = false;
  let lastSeen = 0;
  let lostTimer = null;
  let status = '';

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s); } };

  async function start() {
    if (started) return;
    webgazer.params.saveDataAcrossSessions = false;
    // WebGazer expects its face-mesh wasm/model files next to the page at ./mediapipe/face_mesh,
    // which Vite does not serve (it answers with index.html), so the detector never started and
    // no prediction ever arrived. Load the same files from the CDN, version-matched.
    webgazer.params.faceMeshSolutionPath = FACE_MESH_PATH;
    webgazer.setRegression('ridge').setGazeListener((data) => {
      if (!data) return;
      lastSeen = performance.now();
      setStatus('tracking');
      onPoint(data.x, data.y);
    });
    try {
      await webgazer.begin();
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      throw new Error(denied ? 'Camera permission denied' : 'Camera unavailable');
    }
    started = true;
    webgazer.removeMouseEventListeners();
    webgazer.applyKalmanFilter(false); // smoothing.js (One Euro) replaces it
    webgazer.showPredictionPoints(false);
    webgazer.showFaceOverlay(false);
    webgazer.showFaceFeedbackBox(false);
    webgazer.showVideoPreview(preview);
    const container = document.getElementById('webgazerVideoContainer');
    if (container) container.classList.add('gaze-preview');
    lastSeen = performance.now();
    lostTimer = setInterval(() => {
      if (performance.now() - lastSeen > LOST_AFTER_MS) setStatus('face lost');
    }, 250);
  }

  function stop() {
    if (!started) return;
    clearInterval(lostTimer);
    webgazer.end();
    started = false;
  }

  // Teach the regression that the eyes are looking at (x, y) right now.
  function record(x, y) {
    if (started) webgazer.recordScreenPosition(x, y, 'click');
  }

  async function reset() {
    if (started) await webgazer.clearData();
  }

  return { start, stop, record, reset };
}
