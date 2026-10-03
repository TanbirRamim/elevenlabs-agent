# Tanbir: voice, capture and every page people see

You own the ElevenLabs agents, the browser side of capture, the Turn Gate, the debrief and teach-back flow, the Work Map page, the tutor, the insight panel, and the docs and pitch. Harshit owns DeskSim (which your pages host) and the API.

**Before every task:** read `AGENTS.md` and the contracts listed under **Reads**. Change only the paths under **Owns**. Work on the branch named in the task. Done means the **Acceptance** checks pass and the PR shows their real output.

**Your paths** (from `ownership.json`): `apps/web/` (except `src/components/desk/` and `src/app/desk/`), `agents/`, `docs/` (except `docs/tasks/harshit.md` and `docs/prompt-changelog.md`), `README.md`.

**Contracts you consume (read-only, shared):** `packages/schema/src/api.ts` (REST), `packages/schema/src/protocol.ts` (WebSocket), `apps/web/src/components/desk/types.ts` (DeskSim props).

**Conventions:**
- All HTTP goes through `apps/web/src/lib/api.ts`, all WebSocket traffic through `apps/web/src/lib/stream.ts`. Both validate responses with the `@shadow/schema` types.
- ElevenLabs only through the `useVoice` hook (TAN-1). Verify any SDK option in `node_modules/@elevenlabs/react` types before using it.
- Work against `MOCK_AI=1` on the API until Harshit's real pipeline lands.

---

## TAN-0 · Setup and agents
**Window:** H0:00–0:45 · **Branch:** none · **Depends:** —

1. `pnpm install && pnpm verify` green; `.env` from the shared vault.
2. In the ElevenLabs dashboard, create two agents from `agents/interviewer.md` and `agents/tutor.md`: Expressive Mode on, `skip_turn` enabled, LLM chosen and written into `agents/README.md`. Put the agent ids in `.env`.
3. Read all contracts with Harshit (HAR-0).

**Acceptance:** `curl "localhost:3000/api/eleven/signed-url?agent=interviewer"` returns `{ signedUrl }`.

---

## TAN-1 · `useVoice` hook
**Window:** H0:45–2:30 · **Branch:** `tanbir/use-voice` · **Depends:** TAN-0

**Owns:** `apps/web/src/lib/voice/**` (new)
**Reads:** `agents/README.md` (control protocol), `@elevenlabs/react` types

**Build:**
1. `useVoice({ agent: "interviewer" | "tutor", dynamicVariables })` fetches the signed URL and starts the session with `useConversation` (inside the provider the SDK requires).
2. Expose `status`, `mode`, `transcript` (visible lines only), `start()`, `stop()`, `sendControl(prefix, payload)` (via `sendUserMessage`, filtered out of `transcript`), `sendScreen(text)` (via `sendContextualUpdate`, coalesced to at most one per 2 s, newest wins), `markActivity()` (via `sendUserActivity`), `onUserSpeech(cb)` (for the Turn Gate).
3. Pure helpers (coalescing, control-message filter) live in their own files with Vitest tests.

**Acceptance:** a scratch page lets you talk to the agent; control messages don't appear in the transcript; helper tests green.

---

## TAN-2 · Capture page shell, API and WebSocket clients
**Window:** H2:30–4:00 · **Branch:** `tanbir/capture-shell` · **Depends:** TAN-1, HAR-2 (or mock)

**Owns:** `apps/web/src/app/capture/**`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/stream.ts`, `apps/web/src/components/session/**`
**Reads:** `api.ts`, `protocol.ts`, `components/desk/types.ts`

**Build:**
1. `lib/api.ts`: typed functions for every route in `packages/schema/src/api.ts`, each parsing the response with its schema and throwing on `ApiError`.
2. `lib/stream.ts`: connects to `/sessions/:id/stream`, sends `hello`, validates every `ServerMessage`, reconnects with backoff (0.5 s → 8 s), and exposes typed subscriptions.
3. `/capture`: create a session → render `<DeskSim mode="capture" tickets={expertTickets} clock={sessionClock} onDeskEvent={…} preSave={…} />` on the left and the side panel on the right (agent state chip, live transcript, questions n/5, off-the-record toggle placeholder).
4. Wiring: `onDeskEvent` → stream `desk_event` + `voice.markActivity()` for `input_activity` + `voice.sendScreen("[SCREEN mm:ss] …")` for meaningful events; `screen_event` from the server → `voice.sendScreen`. Capture-mode `preSave` posts to `/guard/presave` and always lets the action through (log only).

**Acceptance (Gate 1):** the expert opens T3, asks the agent "which ticket am I on?", and it answers T3.

---

## TAN-3 · Screen capture and recording
**Window:** H4:00–6:00 · **Branch:** `tanbir/screen-capture` · **Depends:** TAN-2

**Owns:** `apps/web/src/lib/capture/**` (new), `apps/web/src/app/capture/**`

**Build:**
1. `getDisplayMedia({ video: { frameRate: 5 }, preferCurrentTab: true })` (Chrome; fall back to a normal picker). Hidden `<video>`.
2. Every 1.5 s: draw the frame, crop to the `#desksim-root` bounding rect (scale by the stream-to-viewport ratio), black out every `[data-pii]` rect, downscale to 1280 px wide, encode JPEG q 0.7.
3. Difference hash (dHash, 64 bit) in a pure tested module; send `frame` only if the Hamming distance from the last sent frame is ≥ 6. Report `lastScreenChangeMs` for the gate.
4. `MediaRecorder` (webm) records the whole session; on End, `PUT /sessions/:id/recording`.
5. Pause both while off the record.

**Acceptance:** API logs show frames only when the screen changes; the recording plays back from `GET /sessions/:id/recording`; dHash tests green.

---

## TAN-4 · Turn Gate wiring
**Window:** H6:00–7:30 · **Branch:** `tanbir/turn-gate` · **Depends:** TAN-3, HAR-7 (or mock)

**Owns:** `apps/web/src/lib/turnGate.ts`, `apps/web/src/lib/gate/**` (new), `apps/web/src/app/capture/**`

**Build:** feed `decide()` (exists, tested) every 250 ms with `lastUserSpeechMs` (from `onUserSpeech`), `lastInputActivityMs` (DeskSim), `lastScreenChangeMs` (TAN-3), `agentSpeaking`, `offRecord`, `questionsAskedMs`, and the latest `candidate_question`. On open: `sendControl("[ASK]", question.text)`, send `question_asked`, clear the candidate.

**Acceptance (Gate 2, with Harshit):** a 10-minute run on T1–T4: 3–5 questions, ≥ 1 guardrail question, none while the expert speaks or types (insight panel log as proof).

---

## TAN-5 · Off the record
**Window:** H7:30–8:15 · **Branch:** `tanbir/off-record` · **Depends:** TAN-3

**Owns:** `apps/web/src/components/session/**`, `apps/web/src/lib/capture/**`

**Build:** toggle button, `Alt+O`, and the spoken phrases "off the record" / "back on the record" (from the transcript). Off: stop frames and recording, send `off_record`, `sendControl` nothing, show a clear "Off the record" banner. On: resume. Timeline marks the gap.

**Acceptance:** nothing from the span reaches the API (check the API log), and the agent says nothing during it.

---

## TAN-6 · Insight panel
**Window:** H8:15–9:00 · **Branch:** `tanbir/insight-panel` · **Depends:** TAN-4

**Owns:** `apps/web/src/components/insight/**` (new), `apps/web/src/app/capture/**`

**Build:** a collapsible panel (second screen in the demo) showing the five gate signals with live timers, the gate decision and its reason, every candidate with its priority, asked questions with their pause metrics, and the `insight` message numbers (vision p90 latency, unreadable frames, DOM–vision agreement, open gaps).

**Acceptance:** each asked question shows why the gate opened at that moment.

---

## TAN-7 · Debrief flow
**Window:** H9:00–11:00 · **Branch:** `tanbir/debrief` · **Depends:** TAN-4, HAR-9 (or mock)

**Owns:** `apps/web/src/app/capture/**`, `apps/web/src/components/debrief/**` (new)
**Reads:** `EndSessionResponse`, `DebriefAnswerRequest`, `DebriefStatus`

**Build:** End task → `POST /sessions/:id/end` → coverage meter + open questions list → `sendControl("[DEBRIEF]", questions)`. After each expert answer (transcript segments since the question), `POST …/debrief/answer` and update the meter. Stop when `done`.

**Acceptance:** ≥ 3 debrief questions asked, none repeated from the live phase, meter reaches done.

---

## TAN-8 · Teach-back and prediction proof
**Window:** H11:00–12:00 · **Branch:** `tanbir/teachback` · **Depends:** TAN-7

**Owns:** `apps/web/src/components/debrief/**`

**Build:** `POST …/teachback` → `sendControl("[TEACHBACK]", text)` → the expert confirms or corrects (Yes/Correct buttons plus spoken answer) → `POST …/teachback/confirm` → if `recheckText`, read it back once more. Then `POST /workmaps/:id/predictions` and let Shadow state both predictions; the expert marks each right or wrong. Show the "Confirmed" badge with its time.

**Acceptance (Gate 3, with Harshit):** a correction is applied and re-checked, then confirmed; the badge persists after reload.

---

## TAN-9 · Work Map page
**Window:** H12:00–14:00 · **Branch:** `tanbir/workmap-page` · **Depends:** HAR-9 (or mock)

**Owns:** `apps/web/src/app/map/**`, `apps/web/src/components/workmap/**` (new)

**Build:** timeline of steps (order, title, judgment-call badge). A step opens a detail view: redacted frame, decision, the reason as a verbatim quote with its timestamp, guardrails with their quotes, and a clip player (the session recording seeked to `moment.clip`). Guardrails also get a filterable list. Expert controls: delete step/guardrail (`PATCH`), Publish.

**Acceptance:** every step and guardrail opens its clip and quote; publish works; the page works with the mock fixture and with a real map.

---

## TAN-10 · Tutor (Teach page)
**Window:** H14:00–17:00 · **Branch:** `tanbir/tutor` · **Depends:** TAN-9, HAR-11, HAR-12 (or mock)

**Owns:** `apps/web/src/app/teach/**`, `apps/web/src/components/tutor/**` (new)

**Build:**
1. Upload the published map's Markdown (`GET /workmaps/:id/markdown`) to the Tutor agent's knowledge base in the dashboard; start the tutor with `learner_name` and `expert_name`.
2. `/teach` hosts `<DeskSim mode="teach" tickets={newHireTickets} … />`. Its `preSave` calls `/guard/presave`; on BLOCK it returns the verdict (DeskSim pauses) and sends `sendControl("[INTERVENE]", { ruleIds, quote, frameId })`.
3. Client tool `replay_clip({ frameId })` opens an overlay that plays the expert's clip.
4. At judgment steps (ticket opened that matches a step), `sendControl("[PREDICT]", …)`; record the learner's answer with `POST /sessions/:id/predictions`.

**Acceptance (Gate 4, with Harshit), 3 of 3 runs:** N1 → Refund is paused before save; the tutor asks why, quotes the expert, replays the clip; the learner reroutes to Security and the save succeeds.

---

## TAN-11 · Mastery report
**Window:** H17:00–18:00 · **Branch:** `tanbir/mastery` · **Depends:** HAR-12 (or mock)

**Owns:** `apps/web/src/components/tutor/**`, `apps/web/src/app/teach/**`

**Build:** end-of-session view from `GET /sessions/:id/mastery`: each step/guardrail as independent / assisted / missed, "practice next" with links to the expert's clips.

**Acceptance:** renders the fixture and a real session.

---

## TAN-12 · End-to-end test of the intercept
**Window:** H18:00–19:30 · **Branch:** `tanbir/e2e` · **Depends:** TAN-10

**Owns:** `apps/web/e2e/**` (new), `apps/web/playwright.config.ts`

**Build:** Playwright (installed) against `MOCK_AI=1` + `DEMO_FALLBACK_RULES=1` locally: open `/teach`, open N1, click Refund, assert "Paused by Shadow" and that no `action_committed` was sent. Voice is stubbed (no ElevenLabs in CI).

**Acceptance:** `pnpm --filter @shadow/web exec playwright test` green locally; added to CI in a `shared-change` PR if time allows.

---

## TAN-13 · Polish, README, pitch, rehearsal
**Window:** H20:30–24:00 · **Branch:** `tanbir/polish` · **Depends:** feature freeze

**Owns:** `README.md`, `docs/**` (yours), `apps/web/**` (copy and styling only after the freeze)

**Build:** final README (screenshots/GIF of all three modules, architecture, how each Apprentice Test question is answered, how to run, eval results, team), 5-slide deck ending with the moonshot, and three full rehearsals using `docs/demo-script.md`.

**Acceptance:** three clean rehearsals; the README renders well on GitHub; no placeholder text anywhere in the app.
