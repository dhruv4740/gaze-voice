// Copies the MediaPipe wasm + WebGazer face-mesh files from node_modules and downloads
// face_landmarker.task into public/models/ so the demo works with no internet (~60 MB, gitignored).
import { cpSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';

const out = 'public/models';
mkdirSync(out, { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/wasm', `${out}/wasm`, { recursive: true });
cpSync('node_modules/@mediapipe/face_mesh', `${out}/face_mesh`, { recursive: true });
const files = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};
for (const [name, url] of Object.entries(files)) {
  const f = `${out}/${name}`;
  if (existsSync(f) && statSync(f).size > 1e6) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${url} ${res.status}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
}
console.log('models ready in', out);
