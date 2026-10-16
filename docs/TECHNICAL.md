# How Gaze Voice works (technical overview)

A webcam is the only sensor. The hard part is not finding a face; it is turning a noisy, wobbly signal into a pointer someone can trust with "Emergency". Press **Shift+X** (or the HUD **X-ray** button) to watch every step below live.

```
camera -> MediaPipe landmarks -> features -> per-user regression
       -> median + One Euro + dead zone -> snapping with hysteresis
       -> lock-on + speed gate -> dwell / blink / pinch / switch
       -> refractory -> contract events (gaze-select, aac:*)
```

## The steps, and why each exists

1. **Camera + MediaPipe landmarks.** `getUserMedia` 640x480; MediaPipe Face Landmarker (478 points incl. iris) and Hand Landmarker run in the browser (wasm/GPU). One stream is shared; when both run (head+hand) they take alternate frames. *Frames never leave the browser*: only the model files are downloaded.
2. **Features.** Head: the nose tip, mirrored (2 numbers). Iris: per eye, iris position relative to the eye corners and lid opening, plus nose offset normalised by eye distance, head position, and quadratic terms (14 numbers). Hand: index fingertip inside the central 60% of the frame, mapped to the whole screen; pinch = thumb-index distance / hand size below 0.3 (releases above 0.5).
3. **Per-user regression.** Every face is different, so we calibrate: head = affine map fitted by least squares on a 5-dot calibration (centre + four corners); iris = ridge regression (lambda 1) on a 3x3 dot grid, needing at least 20 samples. The fit reports its mean error in pixels (X-ray shows it).
4. **Median + One Euro + dead zone.** Raw webcam gaze wobbles by roughly 100 px, with occasional jumps. A median of the last 5 samples removes outliers; a One Euro filter (Casiez 2012) smooths hard when the pointer is still and follows when it moves (head: minCutoff 0.1, beta 0.003); a 35 px dead zone ignores residual wobble. The hand is precise, so it gets almost none (minCutoff 4, dead zone 3 px, median 1) to avoid lag.
5. **Target snapping with hysteresis.** The pointer snaps to the nearest tile within 150 px (shrinks on dense keyboards). Another tile must be 60 px clearer for 200 ms to steal the target, so the highlight does not flicker between neighbours.
6. **Lock-on + speed gate (the Midas touch fix).** Looking at things is not choosing them. A dwell may start only after the target has been stable for 300 ms *and* the pointer is slower than 400 px/s (measured over 200 ms). Sweeping across the screen therefore selects nothing, and snapping freezes while fast.
7. **Selectors.** Dwell (default 1.2 s, 0.6 to 3 s per patient, a 300 ms slip keeps progress), long blink, pinch (needs lock-on), or a switch (Space/Enter). Combinable, chosen in the start picker or `?select=dwell+blink+pinch`.
8. **Refractory.** After any selection nothing else is selected for 1.5 s (adjustable), so a held gaze cannot repeat. Emergency and Wake are exempt.
9. **Contract events.** `gaze-select` on the tile, plus `aac:*` events between the gaze half and the conversation half (`docs/CONTRACT.md`).

## Live learning
Every confirmed selection is a free calibration sample: the median of the raw features from the 400 ms before it, paired with the tile centre. The model refits every 3 samples (cap 150, weighted 3x vs the original calibration), so accuracy improves while the patient just uses the app. Shift+R resets the learned samples.

## Rest / pause
Rest is manual only (HUD Pause or Shift+P): the board dims and only Wake and Emergency respond. A heard question (`aac:heard`), 2 s dwell on Wake, or a double long blink wakes it. The app never decides by itself that the patient is gone.

## Privacy
No video or image is sent anywhere. Landmark detection runs locally; the caregiver relay carries short text events only (what was spoken, requests, emergency).

## Numbers (reproducible)
- **Noise sim** (`npm run sim`, `scripts/sim/jitter.mjs`): 20 targets x 50 trials, Gaussian noise of 50, 80 and 110 px per axis plus 5% outlier jumps of up to 250 px: 0 wrong selections, 0 timeouts; median time to select 1.88 s (1.91 s at 110 px). Snap radius 120 to 200 px: also 0 wrong.
- **Safety sim** (`scripts/sim/gate.mjs`, 14 checks, all pass): a fast sweep over 6 tiles selects 0; a stable hold selects 1; a double pinch inside 1.5 s selects 1; a pinch before lock-on selects 0; staying on a tile does not repeat.
- **End-to-end** (`npm run e2e`, Playwright on chromium, Groq/Gemini mocked, fake camera): 17 pass in about 44 s, 3 `test.fixme` (known Team B gaps). Covers console errors, dwell-once, fast sweep, slot stability, emergency, the two-page phone relay, picker persistence, pause.
- **Live fps / detect ms / calibration error / learned samples** are shown in the X-ray panel (these depend on the machine and camera; none are claimed here).

Libraries: MediaPipe Tasks Vision (Apache-2.0), WebGazer (eyes mode), `ws`, `qrcode`, Playwright (tests).
