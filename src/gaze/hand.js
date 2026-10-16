// Hand pointer: MediaPipe HandLandmarker (Apache-2.0) index fingertip -> screen by a box
// mapping over the central 60% of the camera frame (mirrored), pinch (thumb tip to index tip)
// = select. No calibration. Frames stay in the browser; only the wasm and model are downloaded.
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LOCAL, CDN, localAvailable } from './models.js';

const LOST_AFTER_MS = 800;
const REGION = 0.6; // central share of the frame that maps onto the whole screen
export const PINCH_ON = 0.3; // thumb-index distance / hand size below this = pinched
export const PINCH_OFF = 0.5; // ...and it must open past this before the next pinch
export const PINCH_FREEZE = 0.7; // pointer holds still from here on, so closing the fingers does not move it
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Pinch ratio: thumb tip (4) to index tip (8) over hand size (wrist 0 to middle knuckle 9).
export const pinchRatio = (lm) => dist(lm[4], lm[8]) / (dist(lm[0], lm[9]) || 1e-6);

// Index fingertip (8) -> normalized 0..1 screen position, mirrored, over the active region.
export function boxMap(lm) {
  const m = (v) => Math.min(1, Math.max(0, (v - (1 - REGION) / 2) / REGION));
  return { u: m(1 - lm[8].x), v: m(lm[8].y) };
}

// Pinch state machine with hysteresis; returns { pinched, justPinched, frozen }.
export function createPinch() {
  let on = false;
  return {
    update(ratio) {
      const was = on;
      if (!on && ratio < PINCH_ON) on = true;
      else if (on && ratio > PINCH_OFF) on = false;
      return { pinched: on, justPinched: on && !was, frozen: on || ratio < PINCH_FREEZE };
    },
    reset() { on = false; },
  };
}

export function createHandTracker({ onPoint, onStatus, onPinch, camera }) {
  let video = null; let canvas = null; let stream = null; let landmarker = null;
  let raf = 0; let running = false; let lastSeen = 0; let status = ''; let lastVideoTime = -1;
  let held = null; // pointer position held while the fingers close
  const pinch = createPinch();
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
      const localOk = await localAvailable(LOCAL.hand);
      const make = async (src, delegate) => HandLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(src.wasm), {
        baseOptions: { modelAssetPath: src.hand, delegate }, runningMode: 'VIDEO', numHands: 1,
      });
      const src = localOk ? LOCAL : CDN;
      try { landmarker = await make(src, 'GPU'); } catch { landmarker = await make(src, 'CPU'); }
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      throw new Error('Could not load hand model (offline?)');
    }
    canvas = document.createElement('canvas');
    canvas.className = 'gaze-head-preview gaze-hand-skeleton';
    canvas.width = 160; canvas.height = 120;
    document.body.appendChild(canvas);
    running = true; lastSeen = performance.now();
    if (camera) { video = camera.video; camera.subscribe(step); return; }
    video = document.createElement('video');
    video.className = 'gaze-head-preview';
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    document.body.appendChild(video);
    await video.play();
    loop();
  }

  function draw(lm) {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;
    c.strokeStyle = 'rgba(129,199,132,.7)'; c.lineWidth = 1.5;
    for (const [a, b] of CONNECTIONS) {
      c.beginPath(); c.moveTo(lm[a].x * 160, lm[a].y * 120); c.lineTo(lm[b].x * 160, lm[b].y * 120); c.stroke();
    }
    c.fillStyle = '#ef5350';
    c.beginPath(); c.arc(lm[8].x * 160, lm[8].y * 120, 3, 0, 7); c.fill();
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (video.currentTime === lastVideoTime || video.readyState < 2) return;
    lastVideoTime = video.currentTime;
    step(performance.now());
  }

  // fps and detect cost, for profiling lag: window.__handStats = { fps, detectMs }
  let frames = 0; let t0 = 0; let costSum = 0;
  function step(now) {
    if (!running) return;
    const c0 = performance.now();
    const lm = landmarker.detectForVideo(video, now).landmarks?.[0];
    costSum += performance.now() - c0; frames++;
    if (now - t0 >= 1000) {
      window.__handStats = { fps: Math.round((frames * 1000) / (now - t0)), detectMs: Math.round((costSum / frames) * 10) / 10 };
      frames = 0; costSum = 0; t0 = now;
    }
    draw(lm);
    if (!lm) {
      if (now - lastSeen > LOST_AFTER_MS) { setStatus('hand lost'); pinch.reset(); held = null; }
      return;
    }
    lastSeen = now;
    setStatus('tracking');
    const st = pinch.update(pinchRatio(lm));
    if (!st.frozen || !held) {
      const { u, v } = boxMap(lm);
      held = { x: u * window.innerWidth, y: v * window.innerHeight };
    }
    onPoint(held.x, held.y);
    if (st.justPinched) onPinch?.();
  }

  function stop() {
    running = false; cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    if (!camera) video?.remove();
    canvas?.remove(); landmarker?.close();
  }

  return { start, stop, record() {}, reset: async () => {}, resetLearning() {} };
}
