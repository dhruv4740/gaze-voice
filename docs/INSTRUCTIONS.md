# Live instructions (read this first, re-read after every `git pull`)

This file is how the coordinator (Opus) talks to both teams and their AI tools.
Newest instructions are at the top of each section.

## Setup (everyone)
1. `git pull` on `main`, then `npm install`.
2. Create `.env.local` in the repo root with the 4 lines Dhruv sends you
   (`VITE_GROQ_API_KEY`, `VITE_GROQ_MODEL`, `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`).
   It is gitignored: never commit it, never paste keys into code.
3. `npm run dev`, open `http://localhost:5173/?mode=mouse` (hover = look, 1.2 s = select).
   Camera modes: `?mode=eyes`, `?mode=head`, `?mode=iris`, or the corner mode switcher.

## AI model rules (Team B)
- Main: Groq `openai/gpt-oss-20b` (tested 16 Oct: ~1 s). Llama is NOT on Groq's free
  tier any more; do not use it.
- Request body must include `reasoning_effort: "low"`, `max_completion_tokens: 300`,
  `response_format: {type: "json_object"}`.
- Fallback only when Groq errors or times out (> 4 s): Gemini
  `gemini-flash-lite-latest` via
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  with header `X-goog-api-key`. It is slow (~12 s under load), so show the fixed
  category phrases immediately and swap in Gemini replies if they arrive.
- Don't spam test calls: free quotas are shared by the whole team.

## Next steps: Team B (review of `feat/conversation-core`, do in this order)
Good work: contract usage, offline fallback, emergency, spell mode all look right.
1. [Important] `groq.js` both requests: add `reasoning_effort: "low"` and replace
   `max_tokens` with `max_completion_tokens: 300`. gpt-oss is a reasoning model; without
   this it can spend the whole budget thinking and return empty content -> you silently
   fall back to offline replies every time.
2. Remove the `'llama-3.1-8b-instant'` default in both functions (Llama is gone from
   the free tier); default to `'openai/gpt-oss-20b'`.
3. Don't use the class `gaze-hover` for your own "active" state on nav tiles: the gaze
   engine adds/removes that class, so your active state will vanish. Use e.g. `is-active`.
4. Gaze targets must be >= ~200x150 px. The Space / Backspace / Clear / Speak pills and
   the mic / language pills are too small for eye tracking: make them tiles.
5. `predictWordCompletions`: add the same 6 s AbortController timeout as `predictReplies`.
6. Then open the PR from `feat/conversation-core` to `main` (it gets reviewed + merged).
7. After merge: Gemini fallback per "AI model rules" above, then Hindi polish.

## Next steps: Team A (Sonnet), branch `feat/gaze-handsfree`
1. Hands-free calibration: patients can't click. Each dot auto-records while the user
   looks at it (settle 600 ms, then sample ~1.2 s), auto-advances; keep click as a
   caregiver shortcut. Same for head/iris 5-point and 9-point flows.
2. Blink-to-select (head and iris modes): MediaPipe face blendshapes
   (`eyeBlinkLeft/Right`), a deliberate long blink (> 400 ms, both eyes) selects the
   hovered target immediately; normal blinks ignored. Toggle in the corner UI.
3. Demo stats (judges love numbers): small toggleable overlay showing selections,
   mean time-to-select, and words per minute spoken via gaze, from `gaze-select` events.
   Keep it inside `src/gaze/`.

## Status
- Team A (gaze): DONE and merged (PR #1): eyes (WebGazer), head (MediaPipe),
  iris (own regression model), One Euro smoothing, calibration, corner UI.
  Next: tune from real-webcam testing.
- Team B (conversation): in progress on `feat/conversation-*`. Full task list:
  [TEAM-B-conversation.md](TEAM-B-conversation.md). Interface: [CONTRACT.md](CONTRACT.md).

## Git rules (everyone)
- Never commit to `main`. Branch, push often, open a PR; it gets reviewed and merged.
- Conventional commit subjects (`feat(conversation): ...`), never "x" or "wip".
- Freeze at 3:45 PM: last PRs merged by then.
