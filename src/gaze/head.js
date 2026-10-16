// Head pointer: MediaPipe Face Landmarker (Apache-2.0) nose tip -> screen via an affine
// map fitted on a 5-point calibration. Frames stay in the browser; the wasm runtime and
// model file are only downloaded.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const NOSE_TIP = 1;
const LOST_AFTER_MS = 800;
const RECENT = 6;

// Least squares for out = a*u + b*v + c over the samples (normal equations, 3x3).
export function fitAffine(samples, key) {
  const S = Array.from({ length: 3 }, () => [0, 0, 0, 0]); // augmented matrix
  for (const s of samples) {
    const row = [s.u, s.v, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) S[i][j] += row[i] * row[j];
      S[i][3] += row[i] * s[key];
    }
  }
  for (let i = 0; i < 3; i++) { // gauss-jordan with partial pivoting
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(S[r][i]) > Math.abs(S[p][i])) p = r;
    [S[i], S[p]] = [S[p], S[i]];
    if (Math.abs(S[i][i]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = S[r][i] / S[i][i];
      for (let c = i; c < 4; c++) S[r][c] -= f * S[i][c];
    }
  }
  return [S[0][3] / S[0][0], S[1][3] / S[1][1], S[2][3] / S[2][2]];
}

// `features(landmarks)` -> number[]; `makeModel(pairs)` -> predict(f) => [x, y] | null,
// where pairs are { f, x, y } calibration samples. Head and iris modes differ only in these.
export function createFaceTracker({ onPoint, onStatus, features, makeModel }) {
  let video = null;
  let stream = null;
  let landmarker = null;
  let raf = 0;
  let lastSeen = 0;
  let status = '';
  let recent = []; // latest feature vectors
  let pairs = []; // calibration { f, x, y }
  let predict = null;
  let running = false;

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s); } };

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      throw new Error(denied ? 'Camera permission denied' : 'Camera unavailable');
    }
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM);
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Could not load face model (offline?)');
    }
    video = document.createElement('video');
    video.className = 'gaze-head-preview';
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    document.body.appendChild(video);
    await video.play();
    running = true;
    lastSeen = performance.now();
    loop();
  }

  let lastVideoTime = -1;
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (video.currentTime === lastVideoTime || video.readyState < 2) return;
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const res = landmarker.detectForVideo(video, now);
    const lms = res.faceLandmarks && res.faceLandmarks[0];
    const f = lms && features(lms);
    if (!f) {
      if (now - lastSeen > LOST_AFTER_MS) setStatus('face lost');
      return;
    }
    lastSeen = now;
    setStatus('tracking');
    recent.push(f);
    if (recent.length > RECENT) recent.shift();
    const p = predict && predict(f);
    if (p) onPoint(p[0], p[1]);
  }

  // Calibration click: pair the recent feature vectors with the dot's screen position.
  function record(x, y) {
    for (const f of recent) pairs.push({ f, x, y });
  }

  // Called by the calibration flow before the accuracy check.
  function fit() { predict = makeModel(pairs); }

  async function reset() { pairs = []; predict = null; }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    video?.remove();
    landmarker?.close();
  }

  return { start, stop, record, reset, fit };
}

// Head pointer: nose tip (mirrored so turning right moves right) -> screen by an affine map.
export function createHeadTracker(opts) {
  return createFaceTracker({
    ...opts,
    features: (lm) => [1 - lm[NOSE_TIP].x, lm[NOSE_TIP].y],
    makeModel(pairs) {
      const sm = pairs.map((q) => ({ u: q.f[0], v: q.f[1], x: q.x, y: q.y }));
      const mx = fitAffine(sm, 'x');
      const my = fitAffine(sm, 'y');
      if (!mx || !my) return null;
      return (f) => [mx[0] * f[0] + mx[1] * f[1] + mx[2], my[0] * f[0] + my[1] * f[1] + my[2]];
    },
  });
}
