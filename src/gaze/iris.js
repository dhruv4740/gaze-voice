// Own gaze model (stretch): MediaPipe iris + eye-corner landmarks + head pose -> screen,
// ridge regression with a few quadratic terms, fitted on the calibration clicks.
import { createFaceTracker } from './head.js';

const LAMBDA = 1.0;
const MIN_SAMPLES = 20;
const ASPECT = 4 / 3; // webcam frames are 640x480; keeps x and y distances comparable
// outer/inner corner, upper/lower lid, iris centre (MediaPipe face mesh with iris)
const EYE_A = { c1: 33, c2: 133, up: 159, lo: 145, iris: 468 };
const EYE_B = { c1: 362, c2: 263, up: 386, lo: 374, iris: 473 };

const pt = (l) => ({ x: l.x * ASPECT, y: l.y });

function eyeFeatures(lm, e) {
  const a = pt(lm[e.c1]); const b = pt(lm[e.c2]); const iris = pt(lm[e.iris]);
  const ex = b.x - a.x; const ey = b.y - a.y;
  const w = Math.hypot(ex, ey) || 1e-6;
  const ux = ex / w; const uy = ey / w;
  const dx = iris.x - (a.x + b.x) / 2; const dy = iris.y - (a.y + b.y) / 2;
  const open = Math.hypot(lm[e.up].x * ASPECT - lm[e.lo].x * ASPECT, lm[e.up].y - lm[e.lo].y) / w;
  return [(dx * ux + dy * uy) / w, (-dx * uy + dy * ux) / w, open];
}

export function irisFeatures(lm) {
  if (lm.length < 478) return null; // model without iris landmarks
  const A = eyeFeatures(lm, EYE_A);
  const B = eyeFeatures(lm, EYE_B);
  const o1 = pt(lm[33]); const o2 = pt(lm[263]); const nose = pt(lm[1]);
  const ipd = Math.hypot(o2.x - o1.x, o2.y - o1.y) || 1e-6;
  const nx = (nose.x - (o1.x + o2.x) / 2) / ipd;
  const ny = (nose.y - (o1.y + o2.y) / 2) / ipd;
  const rx = (A[0] + B[0]) / 2; const ry = (A[1] + B[1]) / 2;
  return [...A, ...B, nx, ny, 1 - lm[1].x, lm[1].y, ipd, rx * rx, ry * ry, rx * ry];
}

// Solve M w = r by gauss-jordan (M is n x n, symmetric positive definite after ridge).
function solve(M, r) {
  const n = r.length;
  const S = M.map((row, i) => [...row, r[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(S[k][i]) > Math.abs(S[p][i])) p = k;
    [S[i], S[p]] = [S[p], S[i]];
    const d = S[i][i];
    for (let c = i; c <= n; c++) S[i][c] /= d;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = S[k][i];
      for (let c = i; c <= n; c++) S[k][c] -= f * S[i][c];
    }
  }
  return S.map((row) => row[n]);
}

// Ridge on standardized features; returns predict(f) => [x, y] or null if too few samples.
export function fitRidge(pairs, lambda = LAMBDA) {
  if (pairs.length < MIN_SAMPLES) return null;
  const n = pairs[0].f.length;
  const mean = Array(n).fill(0); const sd = Array(n).fill(0);
  for (const q of pairs) q.f.forEach((v, i) => { mean[i] += v / pairs.length; });
  for (const q of pairs) q.f.forEach((v, i) => { sd[i] += (v - mean[i]) ** 2 / pairs.length; });
  const sdv = sd.map((v) => Math.sqrt(v) || 1);
  const z = (f) => [1, ...f.map((v, i) => (v - mean[i]) / sdv[i])]; // leading bias term
  const m = n + 1;
  const XtX = Array.from({ length: m }, () => Array(m).fill(0));
  const Xty = [Array(m).fill(0), Array(m).fill(0)];
  for (const q of pairs) {
    const row = z(q.f);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) XtX[i][j] += row[i] * row[j];
      Xty[0][i] += row[i] * q.x;
      Xty[1][i] += row[i] * q.y;
    }
  }
  for (let i = 1; i < m; i++) XtX[i][i] += lambda * pairs.length / 10; // do not penalize bias
  const wx = solve(XtX, Xty[0]);
  const wy = solve(XtX, Xty[1]);
  return (f) => {
    const r = z(f);
    return [r.reduce((a, v, i) => a + v * wx[i], 0), r.reduce((a, v, i) => a + v * wy[i], 0)];
  };
}

export function createIrisTracker(opts) {
  return createFaceTracker({ ...opts, features: irisFeatures, makeModel: fitRidge });
}
