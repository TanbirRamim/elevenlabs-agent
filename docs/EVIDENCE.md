# Evidence

Each requirement from [IMPLEMENTATION_PLAN §1](IMPLEMENTATION_PLAN.md): where it is built, how it is checked, and its status. For a requirement-by-requirement check against the challenge brief on the live site, see [Brief compliance](#brief-compliance).

**Measured on `main` at commit `9897f32`, 2026-10-04,** from a fresh clone, run from the repo root:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` and `pnpm exec turbo run build --filter=@shadow/web^... --filter=@shadow/api^...` | pass |
| `pnpm verify` (lint, typecheck, unit tests) | pass. 414 tests passing, 1 skipped, 55 files: web 244 / 32 files, api 158 + 1 skipped / 21, guard 7 / 1, schema 5 / 1. `prompts` and `edge` have no tests. The skipped test is the live Claude judge test; it runs only with `ANTHROPIC_API_KEY`. |
| `pnpm eval:guard` | catch rate on naive wrong actions 100 % (9/9); false blocks on expert outcomes 0/16 |
| `pnpm eval:tutor seed/fixtures/workmap.json` | judge off (no `ANTHROPIC_API_KEY` in this environment). N1 caught; false blocks 0/12; catch rate 71 % (5/7); held-out 60 % (3/5). Exits 1 because held-out is under the 80 % target. [Details below](#tutor-eval-on-the-sample-map). |
| `pnpm --filter @shadow/web exec playwright test` | 16 tests against the real API with `MOCK_AI=1 DEMO_FALLBACK_RULES=1`, voice stubbed. Run 1: 15 passed, 1 failed (`demo: keyboard controls play, pause, seek and jump chapters`: the "Play the replay" button was not found within 15 s). Immediate re-run: 16/16 passed. |
| `GET https://shadow-web.tanbirramim420.workers.dev/api/eleven/signed-url?agent=interviewer` and `?agent=tutor` | 200 with a signed `wss://api.elevenlabs.io/...` URL for each agent |
| `SMOKE_WEB_URL=https://shadow-web.tanbirramim420.workers.dev pnpm smoke:prod` (2026-10-04) | 13/13 pass: signed URLs for both agents, capture preflight ready, teach holds N1 with G4,G1 in about 3.3 s and predicts on N2, map quotes, copilot safety stats |
| `node scripts/smoke-real.mjs --api https://shadow-api-8hvl.onrender.com` (2026-10-04, live Claude) | all pass: capture with 29 vision events, 5 candidate questions, 3 asked; `/end` built the map; 8 debrief answers, p50 27 ms; teach-back confirmed; evidence verified (4 steps, 11 guardrails, 0 failed evidence); N1 refund BLOCK; mastery; copilot with the judge on |

**Status key**

- **Verified**: on `main` and covered by the named test or command above.
- **Verified with fakes**: the code path is tested with a fake Claude, Presidio or voice session. It was not run against the live service in this pass.
- **Verified live**: run against the deployed web app (Cloudflare Workers) and API (Render) with live ElevenLabs and Claude, in the production smoke or the live pipeline run above.
- **Not verified live**: needs a live session that was not run or recorded for this document.

Test names are quoted from the test files. Unit tests run with `pnpm verify`, e2e tests with the Playwright command.

## 1.1 Pass/fail requirements

### R1. At least 3 live questions, each at a natural pause, about something on screen; at least 1 guardrail question

| Part | Where | How verified | Status |
| --- | --- | --- | --- |
| When: pause detection | [`turnGate.ts`](../apps/web/src/lib/turnGate.ts), loop in [`useTurnGate.ts`](../apps/web/src/lib/gate/useTurnGate.ts) | [`turnGate.test.ts`](../apps/web/src/lib/turnGate.test.ts): "opens at a real pause with a good candidate", "stays quiet while the expert talks", "stays quiet while the expert types", "stays quiet while the screen is changing (reading/scrolling)", "never speaks off the record", "respects the 90 s gap and the 5-per-10-minutes budget". [`useTurnGate.test.ts`](../apps/web/src/lib/gate/useTurnGate.test.ts): "opens at a real pause and stays closed while off the record or without a candidate" | Verified |
| What: gap ranking, guardrail slot first | [`ledger.ts`](../apps/api/src/curiosity/ledger.ts), [`engine.ts`](../apps/api/src/curiosity/engine.ts) | [`engine.test.ts`](../apps/api/src/curiosity/engine.test.ts): "a T3 decision produces a guardrail candidate >= 0.6 naming the ticket", "never proposes a gap whose answer is visible on screen". [`ledger.test.ts`](../apps/api/src/curiosity/ledger.test.ts): "a gap whose answer is on screen scores 0" | Verified with fakes (phrasing by Claude is faked in tests) |
| Screen signals | dHash change filter: [`frameLoop.ts`](../apps/web/src/lib/capture/frameLoop.ts); vision on redacted frames: [`frames.ts`](../apps/api/src/pipeline/frames.ts) | [`frameLoop.test.ts`](../apps/web/src/lib/capture/frameLoop.test.ts): "reports small changes to the gate but only sends at the threshold". [`frames.test.ts`](../apps/api/src/pipeline/frames.test.ts): "redacts, stores, and runs vision on the redacted jpeg", "keeps one vision call in flight and only the newest pending frame" | Verified with fakes |
| The pause reason is visible per question | [`InsightPanel.tsx`](../apps/web/src/components/insight/InsightPanel.tsx), [`reasons.ts`](../apps/web/src/components/insight/reasons.ts) | [`InsightPanel.test.tsx`](../apps/web/src/components/insight/InsightPanel.test.tsx): "formats the insight numbers and the asked question's pause"; [`reasons.test.ts`](../apps/web/src/components/insight/reasons.test.ts): "maps every closed reason to a short sentence" | Verified |
| Three questions, one about a guardrail, each where the gate opens (replay) | [`replay/script.ts`](../apps/web/src/components/replay/script.ts) runs the real `decide()` over a scripted session | [`script.test.ts`](../apps/web/src/components/replay/script.test.ts): "asks at least three questions, at least one about a guardrail", "asks each question only at a moment decide() opens", "each question meets the gate's pause thresholds and spacing"; e2e [`demo.e2e.ts`](../apps/web/e2e/demo.e2e.ts): "demo: the Turn Gate timeline explains each question" | Verified (scripted session) |
| The question is spoken by the agent | `[ASK]` via [`useVoice.ts`](../apps/web/src/lib/voice/useVoice.ts); prompt [`agents/interviewer.md`](../agents/interviewer.md) | [`protocol.test.ts`](../apps/web/src/lib/voice/protocol.test.ts): "formats string and JSON control messages"; e2e [`capture.e2e.ts`](../apps/web/e2e/capture.e2e.ts) with voice stubbed; live: signed URLs for both agents and a two-way `/voice-check` session; the live pipeline run asked 3 of 5 candidate questions | Verified live (voice and question pipeline) |

### R2. Debrief: at least 3 follow-ups not answered live, and a teach-back the expert confirms

| Part | Where | How verified | Status |
| --- | --- | --- | --- |
| Debrief queue: decayed gaps and unseen-case probes | [`engine.ts`](../apps/api/src/curiosity/engine.ts), [`probes.ts`](../apps/api/src/curiosity/probes.ts) | "decayed unanswered gaps move to the debrief queue" ([`engine.test.ts`](../apps/api/src/curiosity/engine.test.ts)); "includes a security/fraud probe when no security handoff was observed", "drops probes whose outcome was observed" ([`ledger.test.ts`](../apps/api/src/curiosity/ledger.test.ts)) | Verified |
| API: end, answer, done rule, teach-back, confirm, correction | [`routes/debrief.ts`](../apps/api/src/routes/debrief.ts) | [`debrief.test.ts`](../apps/api/src/routes/debrief.test.ts): "end builds the map and returns probes for unseen outcomes, sorted by priority", "debrief answers raise coverage and reach done once probes are answered", "teach-back returns text; confirm stamps the map", "a correction rebuilds the map and returns a recheck sentence", "without a model key the debrief routes answer 503 llm_unavailable" | Verified with fakes (map generation and teach-back text are test seams) |
| Browser flow: coverage, teach-back, corrections, confirmation, prediction check | [`debrief/machine.ts`](../apps/web/src/components/debrief/machine.ts), [`DebriefPanel.tsx`](../apps/web/src/components/debrief/DebriefPanel.tsx) | 20 tests in [`machine.test.ts`](../apps/web/src/components/debrief/machine.test.ts), including "stops asking as soon as the API reports done", "applies a correction, reads the re-check back, then confirms", "allows at most two correction rounds". [`DebriefPanel.test.tsx`](../apps/web/src/components/debrief/DebriefPanel.test.tsx): "runs questions, a corrected teach-back and the prediction check by typing and clicking" | Verified |
| Spoken by the agent | `[DEBRIEF]`, `[TEACHBACK]`; [`debrief/speech.ts`](../apps/web/src/components/debrief/speech.ts) | [`DebriefPanel.test.tsx`](../apps/web/src/components/debrief/DebriefPanel.test.tsx): "advances on spoken answers and a spoken yes, and tells the agent what to say" (voice stubbed); live pipeline run: 8 debrief answers, teach-back confirmed | Verified live (debrief and teach-back via the API) |

### R3. Every step and guardrail links to a screen moment and the expert's own words

| Part | Where | How verified | Status |
| --- | --- | --- | --- |
| Contract: no evidence, no step | [`packages/schema/src/workmap.ts`](../packages/schema/src/workmap.ts) | [`workmap.test.ts`](../packages/schema/src/workmap.test.ts): "rejects a step without a quote (no evidence, no step)", "rejects references to guardrails that do not exist", "rejects steps that cite off-the-record time" | Verified |
| Deterministic evidence verifier | [`verify.ts`](../apps/api/src/workmap/verify.ts) | [`verify.test.ts`](../apps/api/src/workmap/verify.test.ts): "flags a fabricated quote", "flags quotes from non-expert speakers and unknown segments", "rejects citations inside off-the-record spans", "flags unknown frames", "flags machineRule phrases that are not in the cited quote" | Verified |
| Builder: draft, verify, one repair pass, failures become open questions | [`build.ts`](../apps/api/src/workmap/build.ts) | [`build.test.ts`](../apps/api/src/workmap/build.test.ts): "repairs once; a still-fabricated quote is removed and becomes an open question", "drops an unsupported machineRule but keeps the guardrail", "a failed repair call keeps the verified part of the first draft" | Verified with fakes (drafts are fixtures, not live Claude output) |
| Work Map view: step to verbatim quote, frame, clip | [`WorkMapView.tsx`](../apps/web/src/components/workmap/WorkMapView.tsx), [`ClipPlayer.tsx`](../apps/web/src/components/workmap/ClipPlayer.tsx) | [`WorkMapView.test.tsx`](../apps/web/src/components/workmap/WorkMapView.test.tsx): "shows a step's verbatim quote, decision and linked guardrails when clicked", "opens a guardrail's evidence and shows its quote". e2e [`workmap.e2e.ts`](../apps/web/e2e/workmap.e2e.ts): "selecting a step shows its verbatim quote" | Verified |
| Recording replay with HTTP Range | [`routes/recording.ts`](../apps/api/src/routes/recording.ts) | [`recording.test.ts`](../apps/api/src/routes/recording.test.ts): "serves a Range request with 206 and the right slice" | Verified |

### R4. The tutor catches at least 1 wrong decision on an unseen case before it is saved, and explains it with the expert's reasoning

| Part | Where | How verified | Status |
| --- | --- | --- | --- |
| Machine rules | [`packages/guard/src/index.ts`](../packages/guard/src/index.ts) | [`index.test.ts`](../packages/guard/src/index.test.ts): "N1: blocks a refund when the card was used without permission (the judged catch)"; `pnpm eval:guard`: 9/9 caught, 0/16 false blocks | Verified with reference guardrails |
| Guard on the published map, then the LLM judge | [`routes/guard.ts`](../apps/api/src/routes/guard.ts), [`llm/judge.ts`](../apps/api/src/llm/judge.ts) | [`judge.test.ts`](../apps/api/src/llm/judge.test.ts): "N1 refund: G1 asks for approval, the judge escalates to BLOCK citing G4 first", "discards a verdict citing unknown guardrail ids", "the judge can never loosen a machine verdict (ALLOW or WARN keep REQUIRE_APPROVAL)", "times out to an explicit timeout_allow". Live pipeline run: N1 refund BLOCK; copilot ran with the judge on. Production smoke: teach holds N1 with G4,G1 in about 3.3 s | Verified live |
| Pre-save endpoint blocks N1 | [`routes/guard.ts`](../apps/api/src/routes/guard.ts) | [`app.test.ts`](../apps/api/src/app.test.ts): "blocks the N1 wrong refund before it is saved"; e2e [`intercept.e2e.ts`](../apps/web/e2e/intercept.e2e.ts): "guard API blocks N1 -> Refund with G4 (the rule path the /teach demo relies on)" | Verified (reference guardrails, `DEMO_FALLBACK_RULES=1`) |
| A blocked save never commits | [`DeskSim.tsx`](../apps/web/src/components/desk/DeskSim.tsx) | [`DeskSim.test.tsx`](../apps/web/src/components/desk/DeskSim.test.tsx): "keeps a BLOCKed action uncommitted and emits no action_committed"; e2e [`intercept.e2e.ts`](../apps/web/e2e/intercept.e2e.ts): "teach: N1 -> Refund is paused by Shadow and never committed" | Verified |
| Explanation with the expert's quote and clip | [`tutor/logic.ts`](../apps/web/src/components/tutor/logic.ts) (`buildIntervention`, `findMoment`), [`TeachSession.tsx`](../apps/web/src/app/teach/TeachSession.tsx) (`[INTERVENE]`, `replay_clip`) | [`logic.test.ts`](../apps/web/src/components/tutor/logic.test.ts): "carries the expert's quote, frame and expected outcome of the first cited rule", "never quotes a lesser rule when the deciding rule is missing from the map", "resolves a frame id to a guardrail's evidence, then to a step" | Verified on screen; spoken explanation not verified live |
| The rule comes from a captured map, not the reference file | Guard reads the published map ([`routes/guard.ts`](../apps/api/src/routes/guard.ts)); publish in [`routes/workmaps.ts`](../apps/api/src/routes/workmaps.ts) | [`workmaps.test.ts`](../apps/api/src/routes/workmaps.test.ts): "publish makes the map available at /workmaps/published"; `pnpm eval:tutor` on the sample map: N1 caught; live pipeline run: map built by Claude from a live capture (4 steps, 11 guardrails, 0 failed evidence), then N1 refund BLOCK | Verified live |

### Tutor eval on the sample map

`pnpm eval:tutor seed/fixtures/workmap.json`, judge off because this environment has no `ANTHROPIC_API_KEY`:

```
eval:tutor on wm_mock_1 v1 (5 guardrails, 4 with machine rules), judge off
  N1   naive refund  -> caught REQUIRE_APPROVAL [G1] via machine_rule; expert handoff_security -> ALLOW via machine_rule
  N2   naive reply   -> caught BLOCK [G6] via machine_rule; expert handoff_legal -> ALLOW via machine_rule
  H1   naive refund  -> MISSED ALLOW via machine_rule; expert escalate_engineering -> ALLOW via machine_rule
  H2   naive refund  -> not scored; expert refund -> ALLOW via machine_rule
  H3   naive refund  -> not scored; expert refund -> REQUIRE_APPROVAL [G1] via machine_rule
  H4   naive reply   -> MISSED ALLOW via machine_rule; expert handoff_legal -> ALLOW via machine_rule
  H5   naive reply   -> not scored; expert reply -> ALLOW via machine_rule
  H6   naive refund  -> caught BLOCK [G2] via machine_rule; expert handoff_billing_disputes -> ALLOW via machine_rule
  H7   naive reply   -> caught BLOCK [G3] via machine_rule; expert handoff_security -> ALLOW via machine_rule
  H8   naive reply   -> caught BLOCK [G6] via machine_rule; expert handoff_legal -> ALLOW via machine_rule
  H9   naive reply   -> not scored; expert hold_request_info -> ALLOW via machine_rule
  H10  naive reply   -> not scored; expert close -> ALLOW via machine_rule
catch rate on naive wrong actions: 71% (5/7)
held-out catch rate: 60% (3/5)
N1 caught: yes
false blocks on expert outcomes: 0/12
```

Rows marked "not scored" are tickets where the naive action is the expert's action or the label names no guardrail.

Why the misses:

- **H1** (CSV export bug, "Refund my 30 EUR", expected Engineering, label G7) and **H4** ("My lawyer will contact you", expected Legal, label G5). The sample map has five guardrails: G1, G2, G3, G4, G6. It has no guardrail for G7 or G5, so no machine rule fires. Turning the judge on would not change this: the judge may only cite a guardrail that exists in the map ([`judge.ts`](../apps/api/src/llm/judge.ts), test "discards a verdict citing unknown guardrail ids"). These are gaps in the sample map's content, which is what the debrief probes in [`probes.ts`](../apps/api/src/curiosity/probes.ts) ask about ("mentions a lawyer, legal action, or GDPR", "a known bug caused the problem").
- **N1** is caught with `REQUIRE_APPROVAL` from the refund limit (G1), not `BLOCK`. The fraud guardrail G4 has no machine rule in the sample map. With a key, the judge escalates it to `BLOCK` citing G4 (test "N1 refund: G1 asks for approval, the judge escalates to BLOCK citing G4 first", with a fake judge). This was not run against live Claude here.

## 1.2 The five Apprentice Test questions

| Question | Where | How verified | Status |
| --- | --- | --- | --- |
| **When to ask**: silence ≥ 1.5 s, no typing ≥ 3 s, still screen ≥ 2.5 s, priority ≥ 0.6, ≤ 5 per 10 min, ≥ 90 s apart | [`turnGate.ts`](../apps/web/src/lib/turnGate.ts) | 7 tests in [`turnGate.test.ts`](../apps/web/src/lib/turnGate.test.ts); live gate state in the insight panel | Verified; no timed live session recorded |
| **What to ask**: slots per decision, priority `slotWeight × surprise × (1 − screenAnswerable) × recency` | [`ledger.ts`](../apps/api/src/curiosity/ledger.ts), [`engine.ts`](../apps/api/src/curiosity/engine.ts) | 13 tests in [`ledger.test.ts`](../apps/api/src/curiosity/ledger.test.ts) and [`engine.test.ts`](../apps/api/src/curiosity/engine.test.ts) | Verified |
| **When it has understood**: coverage ≥ 0.9, no open question at priority ≥ 0.7, ≥ 3 answers (cap 8), confirmed teach-back, two predicted variants | [`routes/debrief.ts`](../apps/api/src/routes/debrief.ts), [`predictions.ts`](../apps/api/src/workmap/predictions.ts), [`debrief/machine.ts`](../apps/web/src/components/debrief/machine.ts) | [`debrief.test.ts`](../apps/api/src/routes/debrief.test.ts) (8 tests); [`workmaps.test.ts`](../apps/api/src/routes/workmaps.test.ts): "predictions derive two variants with distinct outcomes from machine rules"; [`machine.test.ts`](../apps/web/src/components/debrief/machine.test.ts): "marks each prediction and ends confirmed" | Verified with fakes |
| **Whether the new hire learned**: unseen tickets, predict-then-act, guard on every save, computed mastery report | [`routes/teach.ts`](../apps/api/src/routes/teach.ts), [`mastery/compute.ts`](../apps/api/src/mastery/compute.ts), [`MasteryReport.tsx`](../apps/web/src/components/tutor/MasteryReport.tsx) | [`compute.test.ts`](../apps/api/src/mastery/compute.test.ts): "scripted N1/N2 session (HAR-12 acceptance): N1 fraud assisted, N2 GDPR independent", "a right prediction followed by a BLOCKed save is assisted"; [`teach.test.ts`](../apps/api/src/routes/teach.test.ts): "only counts presaves that name the session (header or ?sessionId=)" | Verified |
| **Trust**: off the record, redaction before storage and models, fail closed, edit before publish | see the table below | see below | Verified (unit); not verified live |

### Trust controls

| Control | Where | How verified | Status |
| --- | --- | --- | --- |
| Off the record by button and `Alt+O` | [`CaptureSession.tsx`](../apps/web/src/app/capture/CaptureSession.tsx) (`setRecord`) | [`helpers.test.ts`](../apps/web/src/components/session/helpers.test.ts): "shows off the record over every other state"; Turn Gate: "never speaks off the record"; [`frameLoop.test.ts`](../apps/web/src/lib/capture/frameLoop.test.ts): "captures nothing while paused and picks up again on resume" | Verified |
| Off the record by voice | Browser: [`helpers.ts`](../apps/web/src/components/session/helpers.ts) (`detectRecordPhrase`); API: [`offRecord.ts`](../apps/api/src/privacy/offRecord.ts) | [`helpers.test.ts`](../apps/web/src/components/session/helpers.test.ts): "detects the spoken commands", "does not treat a plain mention of 'on the record' as a command"; [`transcript.test.ts`](../apps/api/src/privacy/transcript.test.ts): "toggles off the record from spoken expert phrases, idempotently", "ignores off-record phrases from non-expert speakers" | Verified (unit); not verified live |
| Off-record spans dropped by the API | [`routes/sessions.ts`](../apps/api/src/routes/sessions.ts), [`transcript.ts`](../apps/api/src/privacy/transcript.ts) | [`transcript.test.ts`](../apps/api/src/privacy/transcript.test.ts): "does not store a segment inside an off-record span" | Verified |
| Transcript redacted with Presidio before storage; placeholder when Presidio fails | [`presidio.ts`](../apps/api/src/privacy/presidio.ts) | [`presidio.test.ts`](../apps/api/src/privacy/presidio.test.ts): "redacts entities and backstops emails Presidio misses (.test TLD)", "stores the placeholder when Presidio is down, never the raw text", "stores the placeholder when the URLs are not configured" | Verified with a fake Presidio |
| Frames redacted before storage and vision; unredactable frames dropped | [`frames.ts`](../apps/api/src/pipeline/frames.ts), [`presidioImage.ts`](../apps/api/src/privacy/presidioImage.ts) | [`frames.test.ts`](../apps/api/src/pipeline/frames.test.ts): "drops the frame when redaction fails: nothing stored, no vision" | Verified with a fake redactor |
| Browser blacks out `[data-pii]`; the raw tab is never recorded | [`redactedStream.ts`](../apps/web/src/lib/capture/redactedStream.ts), [`pii.ts`](../apps/web/src/lib/capture/pii.ts) | [`redactedStream.test.ts`](../apps/web/src/lib/capture/redactedStream.test.ts): "maps a PII rect from crop space into the letterboxed output"; [`DeskSim.test.tsx`](../apps/web/src/components/desk/DeskSim.test.tsx): "stamps events with clock(), throttles input_activity to 500 ms, and marks PII" | Verified (geometry); canvas drawing is browser-only |
| Unverifiable map content becomes an open question | [`build.ts`](../apps/api/src/workmap/build.ts) | [`build.test.ts`](../apps/api/src/workmap/build.test.ts): "repairs once; a still-fabricated quote is removed and becomes an open question" | Verified |
| Judge prompt carries no customer name or email | [`judge.ts`](../apps/api/src/llm/judge.ts) | [`judge.test.ts`](../apps/api/src/llm/judge.test.ts): "sends the judge the case, not the customer's name or email" | Verified |
| Expert deletes steps or guardrails before publishing | `PATCH /workmaps/:id` in [`routes/workmaps.ts`](../apps/api/src/routes/workmaps.ts); controls in [`WorkMapView.tsx`](../apps/web/src/components/workmap/WorkMapView.tsx) | [`workmaps.test.ts`](../apps/api/src/routes/workmaps.test.ts): "PATCH deletes a guardrail, filters references, bumps version", "PATCH refuses to delete every step" | Verified |
| Call audio not stored by the voice agents | Dashboard setting `record_voice: false`, recorded in [`agents/README.md`](../agents/README.md) | Configuration record only | Not verified from code |
| Keys stay on servers; secret scan | [`signed-url/route.ts`](../apps/web/src/app/api/eleven/signed-url/route.ts), [`check-secrets.mjs`](../scripts/check-secrets.mjs) | [`access.test.ts`](../apps/web/src/lib/voice/access.test.ts): "signs a URL when the server has an API key"; CI `verify` job and pre-commit hook ([`lefthook.yml`](../lefthook.yml)) | Verified |

## 1.4 Quality bar

| Item | Status |
| --- | --- |
| ElevenLabs in depth | In code: two ElevenAgents, signed URLs, `sendContextualUpdate`, `sendUserActivity`, `vad_score`, hidden control messages, `skip_turn` in both prompts, client tool `replay_clip`, a Markdown knowledge-base endpoint. Recorded configuration: Claude Sonnet 5.5, Scribe v2 Realtime, Turn V3 ([`agents/README.md`](../agents/README.md)). The deployment issues signed URLs for both agents, and a live voice session on the deployed `/voice-check` page connected and held a two-way conversation with the Interviewer (2026-10-04). Production smoke on the deployed app returned signed URLs for both agents (13/13 checks pass). |
| Live, not canned | Every model call has a schema and a typed failure path ([`structured.ts`](../apps/api/src/llm/structured.ts)). The live pipeline run used real Claude for vision (29 events), questions, the Work Map, teach-back and the guard judge (N1 refund BLOCK, copilot with the judge on). |
| Measured, not claimed | The insight panel shows gate signals, vision p90 latency, unreadable frames, DOM-vision agreement and open gaps ([`metrics.ts`](../apps/api/src/pipeline/metrics.ts)). The guard eval runs in CI on every PR. |
| Calm UX | Agent state is always shown: not started, listening quietly, asking, off the record ([`helpers.test.ts`](../apps/web/src/components/session/helpers.test.ts)). |
| Persistence | Sessions and maps survive an API restart: JSONL on disk, mirrored to S3/R2 ([`jsonl.ts`](../apps/api/src/store/jsonl.ts), 10 tests including "restores sessions and maps from object storage when the local disk was wiped"). |

## Verified live (2026-10-04)

1. **Live voice.** The deployed web app on Cloudflare Workers signs URLs for both agents, and a two-way `/voice-check` session with the Interviewer connected.
2. **Live Capture → Map → Teach.** `node scripts/smoke-real.mjs --api https://shadow-api-8hvl.onrender.com` with live Claude: capture with 29 vision events, 5 candidate questions, 3 asked; `/end` built the map; 8 debrief answers (p50 27 ms); teach-back confirmed; evidence verified (4 steps, 11 guardrails, 0 failed evidence); N1 refund BLOCK; mastery report.
3. **Guard judge live.** N1 refund BLOCK in the pipeline run; the copilot ran with the judge on; the production smoke holds N1 with G4,G1 in about 3.3 s.
4. **Production smoke.** `pnpm smoke:prod` against https://shadow-web.tanbirramim420.workers.dev: 13/13 pass. It runs every 30 minutes in [`prod-smoke.yml`](../.github/workflows/prod-smoke.yml).

## Brief compliance

Checked on 2026-10-04 against [`challenge-brief.pdf`](challenge-brief.pdf) (all 8 pages). Live means a headless Chromium run against <https://shadow-web.tanbirramim420.workers.dev> (API `shadow-api-8hvl.onrender.com`, `/health` 200), with fake camera, microphone and screen. Fake media carries no speech, so anything that needs a spoken answer is marked PARTIAL unless the live pipeline run above covers it.

**Status key:** WORKS LIVE = seen working on the deployed site. PARTIAL = built and tested in code, but only part of it was seen live, or it deviates from the brief's wording. MISSING = not built.

| # | Brief requirement (page) | Status | Evidence | Smallest fix |
| --- | --- | --- | --- | --- |
| 1 | Capture: the expert shares their screen; an ElevenLabs agent listens in a side panel (p3) | WORKS LIVE | `/capture` → Start session: tab share via `getDisplayMedia`, API WebSocket `/sessions/<id>/stream` and the ElevenLabs conversation socket open; REC timer, Pause, Off the record, Stop. Pre-flight: microphone, "Interviewer agent, signed session ready", redaction ready | None. It shares the sandbox helpdesk tab, not an arbitrary desktop, by design (redaction needs the DOM) |
| 2 | A frame every 1–2 s to a vision model, turned into events (p3, p5) | PARTIAL | Code: dHash change filter sends a frame only when the screen changes ([`frameLoop.ts`](../apps/web/src/lib/capture/frameLoop.ts)), vision on redacted frames ([`frames.ts`](../apps/api/src/pipeline/frames.ts)). Live, 35 s on a mostly still desk: 1 `frame`, 5 `desk_event`, 5 `screen_event`, 5 `contextual_update` | Say on screen and in the pitch that frames are sampled every 1–2 s but sent only on change, and that DOM events add exact timing |
| 3 | Agent stays quiet while the expert types, reads or talks; asks at natural pauses (p3, p4 Q1) | PARTIAL | Turn Gate thresholds and 7 unit tests (R1 above); live: 1 `candidate_question`, 1 `question_asked`, 2 agent responses in 35 s | Record one real 5-minute capture with speech and keep the insight-panel timeline as evidence |
| 4 | Required: ≥ 3 questions in a real task, each at a pause, about something on screen, ≥ 1 guardrail (p3) | PARTIAL | Scripted replay proves it with the real `decide()` (`script.test.ts`); live pipeline run asked 3 of 5 candidates. No recorded live session with a human speaking | Same as #3: one recorded live session |
| 5 | Debrief: asks what is still unclear, explains the process back, expert confirms or corrects (p3) | PARTIAL | After Stop, `/capture` shows "Singoda AI · Debrief" with Questions / Teach-back / Predictions tabs; recording uploaded (PUT 204). Headless it stayed on "Building the draft Work Map…" after 12 s. Live pipeline run: 8 debrief answers, teach-back confirmed | Show build progress with an expected duration; record one live debrief |
| 6 | Required: ≥ 3 follow-ups not answered live, ends with a confirmed teach-back (p4) | PARTIAL | Done rule (≥ 3 answers, coverage ≥ 0.9, confirmed teach-back) in [`routes/debrief.ts`](../apps/api/src/routes/debrief.ts), tested; live pipeline run passed | One recorded live debrief |
| 7 | Work Map: clickable timeline; each step shows screen moment, decision, reason in the expert's words, guardrails (p3) | WORKS LIVE | `/map/latest`: 4 clickable steps ("Jump to step N at mm:ss"), session ribbon, decision, quote with timestamp, guardrails G1–G6 typed Limit / Exception / Stop and ask / Never, coverage, confirmed teach-back | None for the view |
| 8 | Required: every step and guardrail links to a screen moment and the expert's own words (p4) | PARTIAL | Enforced by the schema and the evidence verifier (R3 above). But the map published on the live API is the seeded sample (`wm_mock_1`): no frame or clip renders ("this is sample data"), and G6 shows "No step" | Run one real capture on production and publish it, so `/map/latest` shows real frames and clips |
| 9 | Teach: new hire works a case on their own screen, tutor explains steps the expert's way, asks them to predict (p4) | WORKS LIVE | `/teach`: unseen tickets N1, N2; voice tutor starts; `[PREDICT]` panel on open. The tutor watches desk actions (DOM events), not screen frames | None for the demo. Brief says "watches the screen the same way": mention that Teach uses desk events |
| 10 | Tutor steps in before a guardrail is broken and replays the expert's screen moment (p4) | WORKS LIVE | N1 → Refund: "Paused by Singoda AI · Refund was not saved", G4, G1 (`POST /guard/presave` BLOCK, 2.85 s); "Maya would stop here. Why do you think?", Maya's quote, "Play Maya's clip 07:03–07:13", "Take Maya's route" | Clip plays only when the map has a recording: publish a real capture (#8) |
| 11 | Required: judge processes an unseen case; tutor catches ≥ 1 wrong decision before save and explains it with the expert's reasoning (p4) | WORKS LIVE | As #10; the blocked save is never committed (`DeskSim.test.tsx`, `intercept.e2e.ts`) | None |
| 12 | End of Teach: what they mastered and what to practise next (p4) | WORKS LIVE | "Finish session" → Mastery report: Independent / Assisted / Missed, "Practice next", "Watch Maya's clip" (`GET /sessions/<id>/mastery` 200) | None |
| 13 | Apprentice Test Q2, what to ask: picks the question that reveals a reason or guardrail, not one the screen answers (p4) | PARTIAL | `priority = slotWeight × surprise × (1 − screenAnswerable) × recency`, tested ("never proposes a gap whose answer is visible on screen"); phrasing faked in tests, live pipeline used real Claude | Show the chosen candidate and its score in the insight panel during the demo |
| 14 | Q3, when it has understood (p4) | PARTIAL | Coverage ≥ 0.9, no open question ≥ 0.7, ≥ 3 answers, confirmed teach-back, predicted variants (tested); not seen live headless | One recorded live debrief |
| 15 | Q4, whether the new hire learned (p4) | WORKS LIVE | Unseen N1 / N2, predict-then-act, guard on every save, computed mastery report | None |
| 16 | Q5, trust: take something off the record; protect personal data on screen (p4) | PARTIAL | Live UI: "Off the record (Alt O)" during capture; the map shows the off-record span; pre-flight "Personal data on the desk is blacked out in this browser". Presidio server-side and the off-record drop are unit-tested, not exercised live | Toggle off the record once in the recorded session and show the gap in the map |
| 17 | Built with ElevenLabs: ElevenAgents plays interviewer and tutor, Expressive Mode, chosen LLM, Scribe v2 Realtime (p5) | PARTIAL | Two agents, signed URLs 200 for both, `skip_turn`, `sendContextualUpdate`, `sendUserActivity`, client tool `replay_clip`. Expressive Mode, LLM and Scribe v2 Realtime are dashboard settings recorded in [`agents/README.md`](../agents/README.md), not verifiable from code | None in code; show the dashboard settings in the pitch |
| 18 | Work Map goes into the tutor's knowledge base (p6) | PARTIAL | `GET /workmaps/:id/markdown` feeds the tutor; live Teach loads `/workmaps/wm_mock_1/markdown`, the sample map (#8) | Publish a real capture (#8) |
| 19 | Stretch: agent-ready guardrails export (p5) | WORKS LIVE | `/copilot`: "The exported policy", "Download rules.json", "Copy prompt"; `GET /workmaps/published/export`, `POST /copilot/run`, with-map vs no-map comparison | None |
| 20 | Stretch: two experts, one task, show where they differ (p5) | MISSING | No UI or API route | Out of scope for the remaining time; say so in the pitch |
| 21 | Stretch: any language (expert in German, tutor teaches in English) (p5) | MISSING | No language setting in the web app or agent configs | Possible as a dashboard change (agent language plus a prompt line), but not built or tested |
| 22 | Tools hint: tutor looks up guardrails through an MCP server (p6) | MISSING | No MCP server; the tutor gets guardrails through the knowledge base and hidden control messages | Optional hint, not a requirement |
| 23 | Privacy hint: Presidio redacts transcripts and frames (p6) | PARTIAL | Presidio analyzer, anonymizer and image redactor in the Render image; unit tests fail closed. Not observed live | Show one redacted transcript line in the demo |
| 24 | Moonshot slide at the end of the pitch (p5) | PARTIAL | `docs/demo-script.md` ends with "People first, then agents" backed by `/copilot`; the slide itself lives outside the repo | Make sure the deck has the slide |

### Top gaps by judge impact

1. **The live Work Map is the seeded sample (`wm_mock_1`).** Judges opening `/map/latest` see "this is sample data" in the frame panel and no clips, which undercuts "every step links to a screen moment" (#8, #10, #18). Fix: record one real capture on production, finish the debrief and publish it.
2. **No recorded live capture with real speech.** The ≥ 3 questions, debrief and teach-back requirements are proven by tests, a scripted replay and the live pipeline script, not by a recorded human session (#3–#6, #14). Fix: record one session and keep it as the backup video.
3. **Frame cadence reads as below the brief's 1–2 s** (#2). Fix: explain change-based sending, or show the frame counter in the insight panel.
4. **Two experts and any language are not built** (#20, #21). Fix: name them honestly as next steps.
5. **Expressive Mode, LLM choice and Scribe v2 Realtime are dashboard-only** (#17). Fix: a screenshot of the agent settings in the pitch.

## Remaining gaps

1. The two-experts and any-language stretch goals are not built.
2. The API runs on Render's free tier, which sleeps after 15 minutes without traffic. [`keep-api-awake.yml`](../.github/workflows/keep-api-awake.yml) keeps it up; without it the first request waits for a cold start.
3. Frames and recordings on the Render disk are reset on every restart or deploy unless `S3_*` points at durable storage.
4. The plan's live targets (vision p90 ≤ 3 s, ≥ 90 % DOM-vision agreement) are measured in the insight panel but no timed run is recorded, and `pnpm eval:tutor` with the judge on was not recorded.
5. The Playwright test `demo: keyboard controls play, pause, seek and jump chapters` failed once and passed on re-run; the cause was not investigated.
