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

## How to use (walkthrough)

Live: https://gaze-voice-production.up.railway.app (or http://localhost:5173 locally).

1. **Pick an input.** On first open, a picker asks how the patient will point: mouse, head, eyes (iris), hand, or scan with a switch or blink. Combos like head + hand are allowed. You can also skip the picker with a URL such as `/?mode=head`. Head mode is the most reliable on a normal webcam.
2. **Setup walkthrough.** Three full-screen steps, about 3.5 s each, explain how to sit, look at the dots, and select by holding your look. You can skip them, either by looking at Skip or by clicking it.
3. **Calibrate.** Look at each dot until it moves. The results screen shows the accuracy in pixels. Choose **Done** or **Recalibrate**; both work by gaze as well as by click.
4. **Enter a question.** The caregiver can speak it (the mic listens), type it under **Menu → Ask**, or send it from the caregiver phone.
5. **Answer.** Six reply tiles appear, and each kind of answer always sits in the same slot: agree, decline, need, feeling, ask back, other. Hold your look on a tile for 1.2 s and the ring fills, then the reply is spoken aloud and sent to the caregiver phone.
6. **Connect the caregiver phone.** Open **Controls → Caregiver QR** and scan it with the phone. The phone then shows spoken replies, requests and fatigue warnings, and emergencies appear full-screen in red with sound and vibration.

### Main screen buttons
| Button | What it does |
|---|---|
| Reply tiles (6) | AI-predicted replies to the last question. Looking at one speaks it. Pin keeps a favourite reply in place. |
| Yes / No / Wait | Fixed quick answers that never move. |
| Keyboard | Gaze keyboard with word predictions. **Speak** says the typed text aloud. Backspace, Clear and Space work as usual, and WhatsApp shares the typed text. |
| More | Pain map, history, pinned replies, tone, topics/categories, home & nurse requests, and **Stop Listening** (turns the mic off). |
| Emergency | Alarm on the laptop plus a full-screen red alert on the caregiver phone. It works even in rest mode. |
| Menu | Caregiver settings: type a question (Ask), patient language, listener language (Hindi, Marathi, Gujarati, Tamil, Bengali, Telugu; replies are translated before being spoken), high contrast, text size, demo mode, patient profile & meds, daily medical summary. |

### More panel
- **Pain:** choose a body zone, then a 1–10 level. It speaks a sentence like "My back hurts, moderate, 6 out of 10."
- **History / Pinned:** recently spoken replies and saved favourites, for speaking again.
- **Tone:** choose how replies sound (gentle, firm and so on).
- **Topics / Categories:** ready-made phrases grouped by need (food, comfort, family and so on).
- **Home & Nurse:** lights, fan and call-nurse requests, which are spoken and also sent to the phone.

### Controls panel (bottom right)
| Control | What it does |
|---|---|
| Mode dropdown / Change input | Switch the tracker, or reopen the input picker. |
| Chips (Eyes, Dwell, Blink, Switch) | Show which inputs are active. |
| Pause | Rest mode: the screen dims and looking selects nothing. Hold your look on **Wake** for 2 s to resume. Rest also starts by itself after a reply or after 20 s idle. |
| X-ray | Live view of the tracking pipeline (raw point, filtered point, snapping, calibration error). |
| Night | Warm low-light mode for dark rooms. If the camera can't see well enough, it falls back to scan mode. |
| dwell slider | How long you must look to select (default 1.2 s). |
| pause slider | Cool-down after a selection so nothing fires twice (default 1.5 s). |
| Caregiver QR | QR code that opens the phone page. |
| Stats | Number of selections, average time, words per minute, and how the learning is improving. |
| blink select | Allow a deliberate blink to select. |
| sens | Pointer sensitivity for head mode. |
| Recalibrate | Run calibration again. |

### Keyboard shortcuts (caregiver)
Shift+X X-ray · Shift+N night · Shift+P rest · Shift+C recalibrate · Shift+R reset stats and learning · Shift+H hide controls · Shift+[ / ] sensitivity.

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

## Phone on any network
1. `npm run phone`, then in a second terminal `npm run tunnel` (localhost.run over SSH port 22, no account; Windows OpenSSH). It prints `https://<random>.lhr.life`.
2. Open that URL on the laptop, press **Caregiver QR**, scan it with the phone (any network; HTTPS also gives camera permission). The URL changes every run.
3. Alternative: `npm run tunnel:cf` (Cloudflare, needs `tools\cloudflared.exe` and outbound port 7844, which some networks block).

## Deploy (Railway or Render)
One Node service: `npm start` (`server/relay.js`) serves `dist/` and the `/relay` websocket on `$PORT`. Build with `npm install && npm run build:deploy`.
Render: connect the repo, it reads `render.yaml`. Railway: new project from the repo; build `npm run build:deploy`, start `npm start` (Nixpacks detects Node, no config file needed).
Set these as **build-time** env vars in the dashboard (names only): `VITE_GROQ_API_KEY`, `VITE_GROQ_MODEL`, `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`. Redeploy after changing them; they end up in the public JS bundle.
MediaPipe models load from the CDN when `public/models` is absent (nothing to fetch on the host). Open `https://<app>/` on the laptop and `https://<app>/caregiver.html` on the phone, or use **Caregiver QR**.

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

### Start-screen input picker (multi-select)

The start screen has two checkbox groups plus a Start button (mouse, or Tab + Space): **Pointer** (Head, Eyes/iris, Hand, Mouse) and **Select by** (Dwell, Long blink, Pinch, Switch/Space), and a separate **Blink-only scanning** switch that disables the pointer group. Head and Iris are radio-exclusive (both come from the face; if a URL lists both, iris wins). Pinch needs Hand, Long blink needs Head/Iris or scanning; impossible options are greyed with the reason shown. WebGazer `eyes` is no longer offered, but `?mode=eyes` still works.

- URL form: `?mode=head+hand&select=dwell+blink+pinch` (order does not matter; missing `select` gives sensible defaults). The choice is saved in `localStorage` (`gaze-input`, `gaze-select`). "Change input" in the HUD reopens the picker (`?pick=1`) with the current choice ticked.
- Each landmarker runs only if its input is chosen; face + hand share one camera stream. A mouse that is moving takes the pointer from the camera sources.
- HUD chips show the active inputs. For tests: `window.__gazeDebug` = `{mode, sources, select, active, point, fps, lastSelectSource}`; `fps` is per landmarker (`{face, hand}`: `{fps, ms}`).


### Ask from the caregiver phone
`caregiver.html` has an "Ask a question" bar (typed, quick chips, or mic where the browser allows it: needs https or localhost, so over a hotspot IP the mic hides and typing works). The laptop receives it as `aac:remote-question` (see `docs/CONTRACT.md`); the patient's spoken reply appears under the question on the phone. "Also speak aloud on laptop" voices the question there.

### End-to-end tests
`npm run e2e` runs Playwright (chromium) against its own servers on :5190 (app) and :8795 (relay). Groq and Gemini are mocked, the camera is Chromium's fake device. First time: `npx playwright install chromium`. `test.fixme` / `test.fail` mark known Team B gaps.

### Technical overview and X-ray
How the pipeline works, with numbers: [docs/TECHNICAL.md](docs/TECHNICAL.md). Press **Shift+X** (or the HUD X-ray button) to see it live: landmarks on the camera preview, raw (red) vs smoothed (yellow) point, snapped target (green), lock-on, speed, dwell and refractory bars, fps and calibration error.
