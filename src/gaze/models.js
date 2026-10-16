// Model files are served from /models (npm run fetch-models) so the demo works offline;
// each loader falls back to the CDN when the local copy is missing.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const LOCAL = {
  wasm: `${BASE}/models/wasm`,
  task: `${BASE}/models/face_landmarker.task`,
  faceMesh: `${BASE}/models/face_mesh`,
  hand: `${BASE}/models/hand_landmarker.task`,
};
export const CDN = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
  task: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  faceMesh: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

// A missing file on the dev server / SPA host answers 200 with index.html, so check the type.
export async function localAvailable(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && !(r.headers.get('content-type') || '').includes('text/html');
  } catch { return false; }
}

// Returns local if `probe` (a file under it) exists, else the CDN url.
export async function pick(kind, probe) {
  return (await localAvailable(`${LOCAL[kind]}/${probe}`.replace(/\/$/, ''))) ? LOCAL[kind] : CDN[kind];
}
