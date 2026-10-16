// Head pointer: MediaPipe Face Landmarker (Apache-2.0) nose tip -> screen via an affine
// map fitted on a 5-point calibration. Frames stay in the browser; the wasm runtime and
// model file are only downloaded.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LOCAL, CDN, localAvailable } from './models.js';
import { createMeter } from './camera.js';

const NOSE_TIP = 1;
const LOST_AFTER_MS = 800;
const RECENT = 6;
const BLINK_HOLD = 0.4;
const LEARN_WINDOW_MS = 400; // raw features this far back belong to a confirmed selection
const LEARN_CAP = 150;
const REFIT_EVERY = 3;
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

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
// `onBlink(left, right, t)` gets eye-closure blendshape scores every frame.
export function createFaceTracker({ onPoint, onStatus, onBlink, features, makeModel, camera }) {
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
  let hist = []; // { t, f } raw features of the last second, before any smoothing
  let learned = []; // { f, x, y } from confirmed selections
  let sinceFit = 0;

  const setStatus = (s) => { if (s !== status) { status = s; onStatus?.(s); } };

  async function start() {
    if (!camera) { // a shared camera (combined inputs) is opened by its owner
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      } catch (err) {
        const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        throw new Error(denied ? 'Camera permission denied' : 'Camera unavailable');
      }
    }
    try {
      const localOk = await localAvailable(LOCAL.task);
      const make = async (src) => FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(src.wasm), {
        baseOptions: { modelAssetPath: src.task, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: !!onBlink,
      });
      try { landmarker = await make(localOk ? LOCAL : CDN); } catch (e) { if (!localOk) throw e; landmarker = await make(CDN); }
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      throw new Error('Could not load face model (offline?)');
    }
    if (camera) {
      video = camera.video;
      running = true;
      lastSeen = performance.now();
      camera.subscribe(step);
      return;
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
    step(performance.now());
  }

  const meter = createMeter('face');
  function step(now) {
    if (!running) return;
    const c0 = performance.now();
    const res = landmarker.detectForVideo(video, now);
    meter(now, performance.now() - c0);
    const lms = res.faceLandmarks && res.faceLandmarks[0];
    const f = lms && features(lms);
    if (!f) {
      if (now - lastSeen > LOST_AFTER_MS) setStatus('face lost');
      return;
    }
    lastSeen = now;
    setStatus('tracking');
    if (onBlink) {
      const cats = res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories;
      const score = (name) => (cats && cats.find((c) => c.categoryName === name)?.score) || 0;
      const l = score('eyeBlinkLeft'); const r = score('eyeBlinkRight');
      onBlink(l, r, now);
      // lids covering the iris throw the estimate off: hold the pointer while eyes are closed
      if (l > BLINK_HOLD && r > BLINK_HOLD) return;
    }
    recent.push(f);
    if (recent.length > RECENT) recent.shift();
    hist.push({ t: now, f });
    while (hist.length && now - hist[0].t > 1000) hist.shift();
    const p = predict && predict(f);
    if (p) onPoint(p[0], p[1]);
  }

  // Calibration click: pair the recent feature vectors with the dot's screen position.
  // calibration helpers: how many pairs so far, their mean feature, and a way to drop a bad dot
  const count = () => pairs.length;
  const meanSince = (from) => {
    const w = pairs.slice(from);
    return w.length ? w[0].f.map((_, i) => w.reduce((s, q) => s + q.f[i], 0) / w.length) : null;
  };
  const trim = (to) => { pairs.length = to; };

  function record(x, y) {
    for (const f of recent) pairs.push({ f, x, y });
  }

  // Called by the calibration flow before the accuracy check.
  function fit() { predict = makeModel(pairs); }

  // A confirmed selection is a free calibration sample: median of the raw features from the
  // last 400 ms paired with the target centre. Refits every few samples once a model exists.
  function learn(x, y) {
    const now = performance.now();
    const w = hist.filter((h) => now - h.t <= LEARN_WINDOW_MS);
    if (w.length < 3 || !predict) return false;
    const f = w[0].f.map((_, i) => median(w.map((h) => h.f[i])));
    learned.push({ f, x, y });
    if (learned.length > LEARN_CAP) learned.shift();
    if (++sinceFit >= REFIT_EVERY) {
      sinceFit = 0;
      const m = makeModel(pairs.concat(learned, learned, learned)); // learned samples count 3x: they are recent, real use
      if (m) predict = m;
    }
    return true;
  }

  // demo reset: forget live-learned samples, keep the calibration fit
  function resetLearning() { learned = []; hist = []; sinceFit = 0; if (pairs.length) predict = makeModel(pairs) || predict; }

  async function reset() { pairs = []; learned = []; hist = []; predict = null; }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (!camera) video?.remove();
    landmarker?.close();
  }

  return { start, stop, record, reset, resetLearning, fit, learn, count, meanSince, trim };
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

// Blink-only tracker for scan mode: opens the face tracker for blendshapes, produces no pointer.
export function createBlinkTracker(opts) {
  return createFaceTracker({ ...opts, features: (lm) => [lm[NOSE_TIP].x, lm[NOSE_TIP].y], makeModel: () => null });
}
