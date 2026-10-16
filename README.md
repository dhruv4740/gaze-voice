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

## Credits
All code was written during the event on 16 Oct 2026, with AI coding assistants
(Claude by Anthropic). Libraries and APIs used: [Vite](https://vite.dev) (MIT),
[WebGazer.js](https://webgazer.cs.brown.edu) (GPLv3, with MediaPipe Face Mesh, Apache-2.0),
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) (Apache-2.0),
[Groq API](https://groq.com) with openai/gpt-oss-20b, Google Gemini API (fallback),
and the browser Web Speech API.
