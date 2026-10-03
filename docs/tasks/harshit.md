# Harshit: DeskSim, API and the reasoning pipeline

You own the sandbox helpdesk (DeskSim) and everything behind the API: screen understanding, the Curiosity Engine, the Work Map builder, the guard, persistence and deployment. Tanbir owns the voice agent and every page that hosts your work.

**Before every task:** read `AGENTS.md` and the contracts listed under **Reads**. Change only the paths under **Owns**. Work on the branch named in the task. Done means the **Acceptance** checks pass and the PR shows their real output.

**Your paths** (from `ownership.json`): `apps/api/`, `apps/edge/`, `apps/web/src/components/desk/` (except `types.ts`), `apps/web/src/app/desk/`, `packages/guard/`, `packages/prompts/`, `seed/`, `eval/`, `infra/`, `docs/prompt-changelog.md`, this file.

**Contracts you serve (read-only, shared):** `packages/schema/src/api.ts` (REST), `packages/schema/src/protocol.ts` (WebSocket), `apps/web/src/components/desk/types.ts` (DeskSim props).

**Conventions already in the code, keep them:**
- Every Claude call goes through `structured()` in `apps/api/src/llm/structured.ts` with a route from `packages/prompts` and a Zod schema. Handle `LlmError`.
- Every route validates input with the schema from `@shadow/schema` and returns `ApiError` (`{ code, message? }`) on failure.
- Storage goes through the `Store` interface (`apps/api/src/store/memory.ts`). Extend the interface; don't bypass it.
- Logs: `req.log` / `app.log` with `sessionId`. Never log frames, transcript text or keys at `info`.

---

## HAR-0 · Setup and contract read-through
**Window:** H0:00–0:45 · **Branch:** none · **Depends:** —

1. `pnpm install && pnpm verify` must be green. `pnpm infra:up`, then check Presidio: `curl localhost:5002/health`.
2. Fill `.env` from the shared vault. `pnpm dev`, then `curl localhost:4000/health`.
3. Read `packages/schema/src/*.ts` and `apps/web/src/components/desk/types.ts` together with Tanbir. Agree on any change now; after H0:45 contracts change only through a `shared-change` PR.

**Acceptance:** both of you have run `pnpm verify` green and confirmed the contracts.

---

## HAR-1 · DeskSim component
**Window:** H0:45–2:30 · **Branch:** `harshit/desksim` · **Depends:** HAR-0

**Owns:** `apps/web/src/components/desk/**` (not `types.ts`), `apps/web/src/app/desk/page.tsx`
**Reads:** `apps/web/src/components/desk/types.ts`, `packages/schema/src/{ticket,events,guard}.ts`

**Build:**
1. Replace the placeholder in `DeskSim.tsx`. Keep the export name, the props and `id={DESK_ROOT_ID}` on the root element.
2. Layout: a ticket queue on the left (id, subject, tags); ticket detail on the right with customer name, plan, VIP badge, account age, amount, tags (a chargeback tag must stand out), `knownBugId`, subject and body.
3. Action bar: Reply, Refund (amount input prefilled from `amountEur`), Hold / request info, Escalate (Tier 2 · Engineering), Handoff (Security · Legal · Billing disputes), Close. These map one-to-one to `Outcome`.
4. Events via `onDeskEvent`: `ticket_opened` on select; `field_changed` for edits (e.g. refund amount); `input_activity` on keydown/click, throttled to one per 500 ms; `action_committed` only after `preSave` returns a non-BLOCK verdict. Stamp every event with `clock()`.
5. Commit flow: action → show "Checking…" → `await preSave(action)` → ALLOW/WARN commit; REQUIRE_APPROVAL commits with an "Approval requested" note; BLOCK leaves the ticket unchanged and shows a "Paused by Shadow" banner on the action bar until the user picks another action.
6. Put `data-pii` (`PII_ATTR`) on customer name and email elements.
7. Style for legibility at 1280 px: large type, high contrast, no animations. A vision model and a projector both have to read it.
8. `/desk` page: a standalone preview that fetches `GET /tickets?set=expert` and renders `<DeskSim mode="capture" … />` with `preSave` that always returns ALLOW and `onDeskEvent` logging to an on-page list. This page is for your own testing; the real hosts are Tanbir's `/capture` and `/teach`.

**Acceptance:**
- `pnpm verify` green.
- On `/desk`: triage T1–T4 by mouse only; the on-page event list shows every event type.
- A component test (`DeskSim.test.tsx`; `@testing-library/react` and `jsdom` are installed, put `// @vitest-environment jsdom` at the top) proves a BLOCK verdict keeps the action uncommitted and emits no `action_committed`.

**Not in scope:** network calls inside DeskSim, WebSocket, voice, screen capture.

---

## HAR-2 · Tickets API and session extension
**Window:** H2:30–3:15 · **Branch:** `harshit/tickets-api` · **Depends:** HAR-0

**Owns:** `apps/api/src/routes/tickets.ts` (new), `apps/api/src/routes/sessions.ts`, `apps/api/src/app.ts`, tests
**Reads:** `packages/schema/src/api.ts` (`TicketSet`, `TicketsResponse`, `CreateSessionRequest`)

**Build:**
1. `GET /tickets?set=` loads `seed/tickets.json` once at boot, validates with `z.array(Ticket)`, and returns `TicketsResponse` with `label` stripped via `PublicTicket.parse`.
2. `POST /sessions` accepts `CreateSessionRequest` (the optional `workMapId` for teach sessions).
3. Register `@fastify/rate-limit` globally: 300 requests/min per IP, 30/min on routes that call Claude.

**Acceptance:** `app.inject` tests prove: (a) no response body contains `"label"`; (b) unknown `set` → 400 `ApiError`; (c) `pnpm verify` green.

---

## HAR-3 · Mock mode (unblocks Tanbir)
**Window:** H3:15–4:00 · **Branch:** `harshit/mock-mode` · **Depends:** HAR-2

**Owns:** `apps/api/src/mock/**`, `seed/fixtures/**`, `apps/api/src/env.ts`
**Reads:** `packages/schema/src/{api,protocol,workmap}.ts`

**Build:**
1. The `MOCK_AI` flag is already declared in `env.ts` and `.env.example`; branch on `env.MOCK_AI === "1"`.
2. In mock mode, no Claude or Presidio calls happen:
   - every DOM `action_committed` produces a `screen_event`, and 3 s later a `candidate_question` from `seed/fixtures/questions.json` keyed by ticket id (T3 and T4 get guardrail questions);
   - `POST /sessions/:id/end` returns `seed/fixtures/end-session.json`; `debrief/answer` raises coverage by 0.15 per call until `done`;
   - `GET /workmaps/:id` returns `seed/fixtures/workmap.json` (must pass `WorkMap.parse`);
   - `GET /sessions/:id/mastery` returns `seed/fixtures/mastery.json`.
3. A test parses every fixture against its schema.

**Acceptance:** with `MOCK_AI=1`, Tanbir can run Capture → Map → Teach end to end against the API with no keys except ElevenLabs. Fixture test green.

---

## HAR-4 · Transcript ingest, text redaction, off the record
**Window:** H4:00–5:00 · **Branch:** `harshit/transcript` · **Depends:** HAR-2

**Owns:** `apps/api/src/privacy/**`, `apps/api/src/routes/sessions.ts`
**Reads:** `ClientMessage` (`transcript`, `off_record`) in `protocol.ts`

**Build:**
1. `privacy/presidio.ts`: `redactText(text)` → POST analyzer `/analyze` then anonymizer `/anonymize` (URLs from env). On Presidio failure, store `"[redaction unavailable]"`, never the raw text.
2. Transcript segments are redacted before they're stored or passed to any LLM route.
3. Off the record (already in `privacy/offRecord.ts`): also detect the phrases "off the record" / "back on the record" in expert segments and toggle server-side (the browser toggles too; both are idempotent).

**Acceptance:** unit tests: a segment containing an email is stored redacted; a segment inside an off-record span is not stored; Presidio down → placeholder stored.

---

## HAR-5 · Frame redaction, storage, recording
**Window:** H5:00–6:30 · **Branch:** `harshit/frames` · **Depends:** HAR-4

**Owns:** `apps/api/src/privacy/**`, `apps/api/src/storage/**` (new), `apps/api/src/routes/sessions.ts`, `apps/api/src/routes/recording.ts` (new)

**Build:**
1. `storage/s3.ts` with `@aws-sdk/client-s3` against `S3_*` env (MinIO locally). Create the bucket at boot if missing.
2. For each `frame` message (not off the record): Presidio image redactor → store the redacted JPEG at `frames/<sessionId>/<frameId>.jpg`. Unredacted frames are never written anywhere.
3. `PUT /sessions/:id/recording` (webm body, via `@fastify/multipart` or raw body up to 200 MB) → S3. `GET /sessions/:id/recording` streams with Range support (the Work Map and tutor seek into it for clips).

**Acceptance:** after a capture session, MinIO holds only redacted frames (check one manually: the customer name is boxed out); a Range request returns `206`.

---

## HAR-6 · Vision queue and insight metrics
**Window:** H6:30–7:30 · **Branch:** `harshit/vision-queue` · **Depends:** HAR-5

**Owns:** `apps/api/src/pipeline/**` (new), `apps/api/src/llm/vision.ts`, `apps/api/src/routes/sessions.ts`
**Reads:** `VisionResult`, `ScreenEvent`, `ServerMessage` (`screen_event`, `insight`)

**Build:**
1. Per session: at most one vision call in flight; if frames arrive meanwhile, keep only the newest pending one.
2. `extractEvents(prev, cur, recent)` (exists) → each event → `ScreenEvent` (`source: "vision"`) → send `screen_event`.
3. Track per session: vision latency samples, unreadable count, and agreement between vision `action` events and DOM `action_committed` (same ticket and outcome within 5 s). Send `insight` every 5 s.
4. Keep the last 5 `screenAnswers` for HAR-7.

**Acceptance:** on a recorded T1–T4 run: p90 latency printed in the log; agreement ≥ 0.9 or a written note in the PR explaining the misses. **If p90 > 3 s, tell Tanbir before changing models.** That decision gets an ADR.

---

## HAR-7 · Curiosity Engine
**Window:** H7:30–9:00 · **Branch:** `harshit/curiosity` · **Depends:** HAR-6

**Owns:** `apps/api/src/curiosity/**` (new), `packages/prompts/src/index.ts` (curiosity route), tests
**Reads:** `CandidateQuestion`, `OpenQuestion`, §6.5 of `docs/IMPLEMENTATION_PLAN.md`

**Build:**
1. Gap Ledger: each decision (DOM `action_committed`, or vision `decisionCandidate` not yet matched to a DOM event) opens a step hypothesis with slots `reason`, `guardrail` (required), `exception`, `escalation_contact` (handoffs only).
2. When a `question_asked` arrives, record it. Expert transcript within 30 s after it fills that question's slot.
3. Priority = `slotWeight × surprise × (1 − screenAnswerable) × recency` exactly as in §6.5. Pure function, unit-tested.
4. Top gap ≥ 0.6 → the `curiosity` route phrases one ≤ 20-word question naming the ticket → send `candidate_question`. At most one candidate in flight; a newer one replaces it.
5. `unseenCaseProbes(observedOutcomes)` → up to 3 debrief questions about outcomes not seen in the session (fraud/security, legal/GDPR, engineering bug). Needed for the N1 catch.

**Acceptance:** fixture-driven unit tests: (a) the T3 decision yields a guardrail-slot candidate ≥ 0.6; (b) a gap whose answer is in `screenAnswers` scores 0; (c) the probes include a security/fraud question when no security handoff was observed.

---

## HAR-8 · Work Map builder and evidence verifier
**Window:** H9:00–11:30 · **Branch:** `harshit/workmap-builder` · **Depends:** HAR-7

**Owns:** `apps/api/src/workmap/**` (new), `packages/prompts/src/index.ts` (workmap route), tests
**Reads:** `WorkMap`, `Step`, `Guardrail`, §6.6

**Build:**
1. `buildWorkMap(session)`: events + redacted transcript + answered questions + off-record spans → `structured(llm, workMapBuilder, WorkMap, …)`.
2. `verifyEvidence(map, session)`, deterministic and **pure**:
   - each `quote.text` is a verbatim substring (whitespace and case normalized) of its `segmentId`'s text, spoken by the expert;
   - each `frameId` exists in the session's frames;
   - no evidence inside off-record spans;
   - `machineRule.when.bodyMatchesAny` phrases appear in the cited quote, otherwise drop the `machineRule` (keep the guardrail).
3. One repair pass with the violation list; anything still failing is removed and becomes an `OpenQuestion`.

**Acceptance:** unit tests: a fabricated quote is removed and becomes an open question; a valid map passes unchanged; an off-record citation is rejected. `pnpm verify` green.

---

## HAR-9 · Debrief, teach-back and prediction endpoints
**Window:** H11:30–14:00 · **Branch:** `harshit/debrief-api` · **Depends:** HAR-8

**Owns:** `apps/api/src/routes/debrief.ts` (new), `apps/api/src/workmap/**`, `apps/api/src/routes/workmaps.ts` (new)
**Reads:** `EndSessionResponse`, `DebriefAnswerRequest`, `DebriefStatus`, `TeachBackResponse`, `TeachBackConfirmRequest/Response`, `PredictionVariants`, `WorkMapPatch`

**Build:**
1. `POST /sessions/:id/end` → draft map + open questions (gaps + `unseenCaseProbes`), sorted by priority.
2. `POST /sessions/:id/debrief/answer` → incremental rebuild → `DebriefStatus`. Done rule: coverage ≥ 0.9 AND no open question ≥ 0.7 AND asked ≥ 3; hard cap at 8 asked.
3. `POST /sessions/:id/teachback` → `teachBack` route text. `POST /sessions/:id/teachback/confirm` → set `teachBackConfirmedAtMs` or apply the correction and return `recheckText`.
4. `POST /workmaps/:id/predictions` → 2 variants with the predicted outcome and the step that justifies it.
5. `GET/PATCH /workmaps/:id`, `POST /workmaps/:id/publish`, `GET /workmaps/published`, `GET /workmaps/:id/markdown` (steps in order, each with reason quote, guardrails, and "ask a senior colleague" for anything not covered).

**Acceptance:** `app.inject` tests for each route incl. the done rule; the Markdown for the fixture map renders every guardrail with its quote.

---

## HAR-10 · Session persistence
**Window:** H14:00–14:45 · **Branch:** `harshit/persistence` · **Depends:** HAR-9

**Owns:** `apps/api/src/store/**`

**Build:** a `jsonl` adapter for `Store`: append every mutation to `sessions/<id>.jsonl`, on local disk (`infra/data/`) in development and in R2 (via `storage/s3.ts`) when `S3_ENDPOINT` is set. In production the API runs in a Cloudflare Container whose disk is wiped when it stops, so R2 is the only durable copy. Replay on boot. Keep the in-memory adapter for tests.

**Acceptance:** start a session, restart the API, the session and published map are still there (test with a temp dir).

---

## HAR-11 · Guard on the published map + LLM judge
**Window:** H14:45–16:30 · **Branch:** `harshit/guard-judge` · **Depends:** HAR-9

**Owns:** `apps/api/src/routes/guard.ts`, `apps/api/src/llm/judge.ts` (new), `packages/guard/**`, `packages/prompts/src/index.ts` (judge route)
**Reads:** `PendingAction`, `GuardVerdict`, §6.8

**Build:**
1. Rules come from the published map (`rulesFromStore`, exists). `DEMO_FALLBACK_RULES` stays `0` in every judged run.
2. If machine rules return ALLOW and the outcome is `refund`, `reply` or `close`: call the `guardJudge` route with the map's guardrails, 2.5 s timeout. The judge may only cite existing guardrail ids; validate that, and discard any verdict citing an unknown id.
3. Timeout → `{ decision: "ALLOW", source: "timeout_allow" }`, logged at `warn`.
4. Record every verdict on the session (for mastery).

**Acceptance:** with a captured map whose fraud guardrail has **no** machine rule, N1 + refund → BLOCK via `llm_judge` (integration test behind `ANTHROPIC_API_KEY`, skipped without it); the unknown-id test passes.

---

## HAR-12 · Teach endpoints and mastery
**Window:** H16:30–18:00 · **Branch:** `harshit/mastery` · **Depends:** HAR-11

**Owns:** `apps/api/src/routes/teach.ts` (new), `apps/api/src/mastery/**` (new)
**Reads:** `LearnerPrediction`, `LearnerPredictionResult`, `MasteryReport`

**Build:**
1. `POST /sessions/:id/predictions` → compare to the map's step → `LearnerPredictionResult` with the reason quote and frameId.
2. `GET /sessions/:id/mastery`: per step/guardrail touched: `independent` (right first time, no block), `assisted` (right after a wrong prediction or a BLOCK), `missed` (committed against a WARN or never right). `practiceNext` = missed, then assisted.

**Acceptance:** unit test over a scripted N1/N2 session gives N1-fraud `assisted` and N2-GDPR `independent`.

---

## HAR-13 · Captured-map eval
**Window:** H18:00–19:00 · **Branch:** `harshit/eval-tutor` · **Depends:** HAR-11

**Owns:** `eval/**`, `packages/guard/src/**`, root script `eval:tutor` (in a `shared-change` PR, or ask Tanbir)

**Build:** `pnpm eval:tutor <workMapId>` runs guard (rules + judge) over N1, N2, H1–H10 with the naive action, prints the catch rate and false blocks, and writes `eval/out/tutor-<date>.json`.

**Acceptance:** the scorecard from the latest rehearsal map is pasted in the PR; N1 is caught.

---

## HAR-14 · Deploy (Vercel + tunnel, free)
**Window:** H19:00–20:30 · **Branch:** `harshit/deploy` · **Depends:** gates passed

**Owns:** `infra/**`, `apps/api/Dockerfile`, `apps/edge/**`

**Build:** follow `docs/DEPLOY.md`. Run `pnpm api:public --web <vercel url>` on the demo laptop, send Tanbir the printed tunnel URL so he sets `NEXT_PUBLIC_API_*` on Vercel and redeploys, then run one full Capture → Map → Teach on the deployed web app. The paid Cloudflare path in `apps/edge/` stays as an option if the Workers Paid plan is ever enabled.

**Acceptance:** `https://<tunnel>/health` OK from another device, and one full Capture → Map → Teach run on the Vercel URL.

---

## HAR-15 · Copilot export (stretch, only if every gate passed early)
**Branch:** `harshit/copilot` · **Owns:** `apps/api/src/routes/export.ts`

`GET /workmaps/:id/export?format=agent` → system prompt + `rules.json`; `POST /copilot/run` → guard + judge over the 10 held-out tickets → decisions, cited rules, agreement with labels. Tanbir builds the `/copilot` page against it.
