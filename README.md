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
- `?mode=hand`: for users who can move a hand but not speak. The index fingertip is the pointer (central 60% of the camera frame maps to the whole screen); pinching thumb and index selects instantly. No calibration. Hand tracking uses MediaPipe HandLandmarker (Apache-2.0, `@mediapipe/tasks-vision`). The hand cursor follows the raw smoothed fingertip (light filter, no median); snapping only picks the target. `window.__handStats` shows detection fps and ms per frame.
- `?mode=head+hand`: one camera stream feeds both the face and hand models on alternate frames. The hand takes the pointer while visible (120 ms crossfade), otherwise the head; head calibration still runs. Any source can select. Pick it as "Head + hand" in the input picker.

### Rest mode

Resting dims the screen and disables dwell and blink selection except a big **Wake** target (top centre, dwell 2 s) and elements with `data-gaze-always` (emergency). Rest is **manual only**: HUD **Pause** or **Shift+P**. Wake with the target, a double long blink, a heard question (`aac:heard`) or the emergency tile. Contract details are in `docs/CONTRACT.md`.

### Input modes

No `?mode` shows a "How can you move?" picker on first load (choice saved in localStorage; the HUD **Change input** button resets it). `?mode=` always wins and is not saved.

| mode | for | select |
|---|---|---|
| `head` | head/nose pointing (default choice for "Eyes / head") | dwell, long blink |
| `eyes`, `iris` | webcam eye tracking | dwell, long blink (iris) |
| `hand` | finger pointing | dwell, pinch |
| `head+hand` (also `iris+hand`) | head, or the hand once it is visible | dwell, pinch, long blink, Space/Enter |
| `scan` | blink only or one switch | row-column scan; long blink, Space/Enter or click picks |
| `mouse` | caregiver / testing | click |

### Selection safety and timing

A dwell starts only after the snapped target has been stable 300 ms with the pointer slow (< 400 px/s); fast sweeps never select, and snapping freezes while the pointer is fast. After any selection there is a 1.5 s pause with no selection (tiles dim). HUD sliders set dwell time (per input mode, default 1.2 s, hand 1.0 s) and the pause; both persist. Pinch needs the pointer locked on.
