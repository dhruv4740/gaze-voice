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
