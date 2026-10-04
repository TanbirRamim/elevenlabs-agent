# Evidence

Each requirement from [IMPLEMENTATION_PLAN §1](IMPLEMENTATION_PLAN.md): where it is built, how it is checked, and its status.

**Measured on `main` at commit `9897f32`, 2026-10-04,** from a fresh clone, run from the repo root:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` and `pnpm exec turbo run build --filter=@shadow/web^... --filter=@shadow/api^...` | pass |
| `pnpm verify` (lint, typecheck, unit tests) | pass. 414 tests passing, 1 skipped, 55 files: web 244 / 32 files, api 158 + 1 skipped / 21, guard 7 / 1, schema 5 / 1. `prompts` and `edge` have no tests. The skipped test is the live Claude judge test; it runs only with `ANTHROPIC_API_KEY`. |
| `pnpm eval:guard` | catch rate on naive wrong actions 100 % (9/9); false blocks on expert outcomes 0/16 |
| `pnpm eval:tutor seed/fixtures/workmap.json` | judge off (no `ANTHROPIC_API_KEY` in this environment). N1 caught; false blocks 0/12; catch rate 71 % (5/7); held-out 60 % (3/5). Exits 1 because held-out is under the 80 % target. [Details below](#tutor-eval-on-the-sample-map). |
| `pnpm --filter @shadow/web exec playwright test` | 16 tests against the real API with `MOCK_AI=1 DEMO_FALLBACK_RULES=1`, voice stubbed. Run 1: 15 passed, 1 failed (`demo: keyboard controls play, pause, seek and jump chapters`: the "Play the replay" button was not found within 15 s). Immediate re-run: 16/16 passed. |
| `GET https://shadow-web-meow-4acb.vercel.app/api/eleven/signed-url?agent=interviewer` and `?agent=tutor` | 200 with a signed `wss://api.elevenlabs.io/...` URL for each agent |

**Status key**

- **Verified**: on `main` and covered by the named test or command above.
- **Verified with fakes**: the code path is tested with a fake Claude, Presidio or voice session. It was not run against the live service in this pass.
- **Not verified live**: needs a live session with ElevenLabs voice, Claude and Presidio. No such session was run or recorded for this document.

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
| The question is spoken by the agent | `[ASK]` via [`useVoice.ts`](../apps/web/src/lib/voice/useVoice.ts); prompt [`agents/interviewer.md`](../agents/interviewer.md) | [`protocol.test.ts`](../apps/web/src/lib/voice/protocol.test.ts): "formats string and JSON control messages"; e2e [`capture.e2e.ts`](../apps/web/e2e/capture.e2e.ts) with voice stubbed | Not verified live |

### R2. Debrief: at least 3 follow-ups not answered live, and a teach-back the expert confirms

| Part | Where | How verified | Status |
| --- | --- | --- | --- |
| Debrief queue: decayed gaps and unseen-case probes | [`engine.ts`](../apps/api/src/curiosity/engine.ts), [`probes.ts`](../apps/api/src/curiosity/probes.ts) | "decayed unanswered gaps move to the debrief queue" ([`engine.test.ts`](../apps/api/src/curiosity/engine.test.ts)); "includes a security/fraud probe when no security handoff was observed", "drops probes whose outcome was observed" ([`ledger.test.ts`](../apps/api/src/curiosity/ledger.test.ts)) | Verified |
| API: end, answer, done rule, teach-back, confirm, correction | [`routes/debrief.ts`](../apps/api/src/routes/debrief.ts) | [`debrief.test.ts`](../apps/api/src/routes/debrief.test.ts): "end builds the map and returns probes for unseen outcomes, sorted by priority", "debrief answers raise coverage and reach done once probes are answered", "teach-back returns text; confirm stamps the map", "a correction rebuilds the map and returns a recheck sentence", "without a model key the debrief routes answer 503 llm_unavailable" | Verified with fakes (map generation and teach-back text are test seams) |
| Browser flow: coverage, teach-back, corrections, confirmation, prediction check | [`debrief/machine.ts`](../apps/web/src/components/debrief/machine.ts), [`DebriefPanel.tsx`](../apps/web/src/components/debrief/DebriefPanel.tsx) | 20 tests in [`machine.test.ts`](../apps/web/src/components/debrief/machine.test.ts), including "stops asking as soon as the API reports done", "applies a correction, reads the re-check back, then confirms", "allows at most two correction rounds". [`DebriefPanel.test.tsx`](../apps/web/src/components/debrief/DebriefPanel.test.tsx): "runs questions, a corrected teach-back and the prediction check by typing and clicking" | Verified |
| Spoken by the agent | `[DEBRIEF]`, `[TEACHBACK]`; [`debrief/speech.ts`](../apps/web/src/components/debrief/speech.ts) | [`DebriefPanel.test.tsx`](../apps/web/src/components/debrief/DebriefPanel.test.tsx): "advances on spoken answers and a spoken yes, and tells the agent what to say" (voice stubbed) | Not verified live |

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
| Guard on the published map, then the LLM judge | [`routes/guard.ts`](../apps/api/src/routes/guard.ts), [`llm/judge.ts`](../apps/api/src/llm/judge.ts) | [`judge.test.ts`](../apps/api/src/llm/judge.test.ts): "N1 refund: G1 asks for approval, the judge escalates to BLOCK citing G4 first", "discards a verdict citing unknown guardrail ids", "the judge can never loosen a machine verdict (ALLOW or WARN keep REQUIRE_APPROVAL)", "times out to an explicit timeout_allow". The live test "catches the N1 wrong refund via llm_judge with no machine rule" was skipped (no key) | Verified with fakes; live judge not run in this pass |
| Pre-save endpoint blocks N1 | [`routes/guard.ts`](../apps/api/src/routes/guard.ts) | [`app.test.ts`](../apps/api/src/app.test.ts): "blocks the N1 wrong refund before it is saved"; e2e [`intercept.e2e.ts`](../apps/web/e2e/intercept.e2e.ts): "guard API blocks N1 -> Refund with G4 (the rule path the /teach demo relies on)" | Verified (reference guardrails, `DEMO_FALLBACK_RULES=1`) |
| A blocked save never commits | [`DeskSim.tsx`](../apps/web/src/components/desk/DeskSim.tsx) | [`DeskSim.test.tsx`](../apps/web/src/components/desk/DeskSim.test.tsx): "keeps a BLOCKed action uncommitted and emits no action_committed"; e2e [`intercept.e2e.ts`](../apps/web/e2e/intercept.e2e.ts): "teach: N1 -> Refund is paused by Shadow and never committed" | Verified |
| Explanation with the expert's quote and clip | [`tutor/logic.ts`](../apps/web/src/components/tutor/logic.ts) (`buildIntervention`, `findMoment`), [`TeachSession.tsx`](../apps/web/src/app/teach/TeachSession.tsx) (`[INTERVENE]`, `replay_clip`) | [`logic.test.ts`](../apps/web/src/components/tutor/logic.test.ts): "carries the expert's quote, frame and expected outcome of the first cited rule", "never quotes a lesser rule when the deciding rule is missing from the map", "resolves a frame id to a guardrail's evidence, then to a step" | Verified on screen; spoken explanation not verified live |
| The rule comes from a captured map, not the reference file | Guard reads the published map ([`routes/guard.ts`](../apps/api/src/routes/guard.ts)); publish in [`routes/workmaps.ts`](../apps/api/src/routes/workmaps.ts) | [`workmaps.test.ts`](../apps/api/src/routes/workmaps.test.ts): "publish makes the map available at /workmaps/published"; `pnpm eval:tutor` on the sample map: N1 caught | Verified on the sample map; not verified on a map captured live |

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
| ElevenLabs in depth | In code: two ElevenAgents, signed URLs, `sendContextualUpdate`, `sendUserActivity`, `vad_score`, hidden control messages, `skip_turn` in both prompts, client tool `replay_clip`, a Markdown knowledge-base endpoint. Recorded configuration: Claude Sonnet 5.5, Scribe v2 Realtime, Turn V3 ([`agents/README.md`](../agents/README.md)). The deployment issues signed URLs for both agents. A full live voice session was not run for this document. |
| Live, not canned | Every model call has a schema and a typed failure path ([`structured.ts`](../apps/api/src/llm/structured.ts)). The guard judge handles wording no machine rule covers (fake-judge tests). Not verified live in this pass. |
| Measured, not claimed | The insight panel shows gate signals, vision p90 latency, unreadable frames, DOM-vision agreement and open gaps ([`metrics.ts`](../apps/api/src/pipeline/metrics.ts)). The guard eval runs in CI on every PR. |
| Calm UX | Agent state is always shown: not started, listening quietly, asking, off the record ([`helpers.test.ts`](../apps/web/src/components/session/helpers.test.ts)). |
| Persistence | Sessions and maps survive an API restart: JSONL on disk, mirrored to S3/R2 ([`jsonl.ts`](../apps/api/src/store/jsonl.ts), 10 tests including "restores sessions and maps from object storage when the local disk was wiped"). |

## Not verified

1. A live voice session with either agent, end to end.
2. A full Capture → Map → Teach run with a map built by live Claude from a live session, Presidio running.
3. The guard judge against live Claude (`pnpm --filter @shadow/api test` with `ANTHROPIC_API_KEY`) and `pnpm eval:tutor` with the judge on.
4. The plan's live targets (vision p90 ≤ 3 s, ≥ 90 % DOM-vision agreement, 3–5 questions in a 10-minute session). The insight panel measures them; no live run is recorded.
5. The Playwright test `demo: keyboard controls play, pause, seek and jump chapters` failed once and passed on re-run; the cause was not investigated.
