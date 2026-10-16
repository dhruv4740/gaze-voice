// Copies the MediaPipe wasm + WebGazer face-mesh files from node_modules and downloads
// face_landmarker.task into public/models/ so the demo works with no internet (~60 MB, gitignored).
import { cpSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';

const out = 'public/models';
mkdirSync(out, { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/wasm', `${out}/wasm`, { recursive: true });
cpSync('node_modules/@mediapipe/face_mesh', `${out}/face_mesh`, { recursive: true });
const task = `${out}/face_landmarker.task`;
if (!existsSync(task) || statSync(task).size < 1e6) {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  writeFileSync(task, Buffer.from(await res.arrayBuffer()));
}
console.log('models ready in', out);
