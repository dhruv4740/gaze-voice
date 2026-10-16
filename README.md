# Gaze Voice

Webcam-only communication aid for people with ALS, locked-in syndrome or stroke who can't speak or type. No special hardware: the laptop camera tracks where the user looks. An AI listens to the question being asked and predicts whole replies, so the user answers in one glance instead of spelling letter by letter. Video frames never leave the browser.

Built at **Renaissance 2026 (CSI KJSSE Buildathon)**, 16 Oct 2026. Pillar: **Human Potential**.

## Run
```bash
npm install
cp .env.example .env.local   # add your Groq key
npm run dev
```
Open `/?mode=mouse` (hover = look), `/?mode=eyes` (WebGazer eye tracking) or `/?mode=head` (MediaPipe head pointer).

## Architecture
| Path | What | Owner |
|---|---|---|
| `src/gaze/` | Gaze input: eye/head tracking, calibration, smoothing, dwell selection | Team A |
| `src/conversation/` | Speech-to-text, AI reply prediction, tiles, spelling, speech out | Team B |

The two halves only talk through [docs/CONTRACT.md](docs/CONTRACT.md).

More: [docs/PLAN.md](docs/PLAN.md) · [docs/INSTRUCTIONS.md](docs/INSTRUCTIONS.md)

## It learns while you use it
Every confirmed selection becomes a calibration sample (median raw features of the last 400 ms
paired with the target centre) and the head/iris/eyes models refit every few selections. The
stats panel shows pointer error per selection as a sparkline. A fatigue watch (blink rate vs
your own baseline, selections slowing) shows a "Take a break?" tile, lengthens the default
dwell, and sends `gaze:fatigue` to the caregiver phone. Demo: `__gazeFatigue.force('mild')`.

## Caregiver phone companion
`npm run phone` starts the relay (port 8787) and Vite on the LAN. On the patient laptop
tap **Caregiver QR** (bottom-left) and scan it with a phone on the same Wi-Fi. The phone
page shows what the patient says, request cards, fatigue notices, and a full-screen red
alert with vibration and sound on emergency. Only short text events go through the relay.

## Credits
All code was written during the event on 16 Oct 2026, with AI coding assistants
(Claude by Anthropic). Libraries and APIs used: [Vite](https://vite.dev) (MIT),
[WebGazer.js](https://webgazer.cs.brown.edu) (GPLv3, with MediaPipe Face Mesh, Apache-2.0),
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) (Apache-2.0),
[Groq API](https://groq.com) with openai/gpt-oss-20b, Google Gemini API (fallback),
[ws](https://github.com/websockets/ws) (MIT, caregiver relay),
[node-qrcode](https://github.com/soldair/node-qrcode) (MIT, phone QR code),
and the browser Web Speech API.

## Demo shortcuts and offline models

- No `?mode` starts head mode; if the camera is denied it falls back to mouse and says so in the status line.
- Caregiver keys: **Shift+R** demo reset (stats, fatigue, live-learned samples; calibration kept), **Shift+C** recalibrate, **Shift+H** hide the camera preview, HUD and stats for a clean projector view.
- Run `npm run fetch-models` once (needs internet) to copy the MediaPipe/WebGazer wasm and download `face_landmarker.task` into `public/models/` (~60 MB, gitignored). The app loads these first and falls back to the CDN.

### Head sensitivity and hand mode

- Camera modes (head, iris, eyes) have a sensitivity slider in the HUD (0.5–2.0, saved), also **Shift+]** / **Shift+[**. Lower = a bigger movement per screen distance. Head calibration now says to point with the nose and redoes a dot if the head barely moved.
- `?mode=hand`: for users who can move a hand but not speak. The index fingertip is the pointer (central 60% of the camera frame maps to the whole screen); pinching thumb and index selects instantly. No calibration. Hand tracking uses MediaPipe HandLandmarker (Apache-2.0, `@mediapipe/tasks-vision`).
