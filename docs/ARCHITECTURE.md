# Architecture

Shadow is a TypeScript monorepo: a Next.js web app, a Fastify API, and shared packages. This page shows what runs where, then follows one capture session and one teach session through the code. It describes `main` at commit `9897f32` (2026-10-04).

For the plan and the reasons behind each decision, see [IMPLEMENTATION_PLAN §3](IMPLEMENTATION_PLAN.md). For requirement status, see [EVIDENCE.md](EVIDENCE.md).

## Components

```mermaid
flowchart TB
  subgraph Browser["apps/web (Next.js 16, React 19)"]
    DS["DeskSim helpdesk<br/>components/desk"]
    CAP["Screen capture<br/>lib/capture: crop, [data-pii] blackout,<br/>dHash change filter, redacted canvas recorder"]
    GATE["Turn Gate<br/>lib/turnGate.ts + lib/gate/useTurnGate.ts"]
    VOICE["Voice layer<br/>lib/voice: useVoice, protocol, coalesce"]
    DEB["Debrief<br/>components/debrief"]
    INS["Insight panel<br/>components/insight"]
    MAPV["Work Map view<br/>components/workmap: evidence, clip, edit, publish"]
    TUT["Teach + mastery report<br/>app/teach, components/tutor"]
    COP["Copilot<br/>components/copilot"]
    SU["/api/eleven/signed-url<br/>(server route)"]
  end

  subgraph API["apps/api (Fastify 5)"]
    WS["WS /sessions/:id/stream<br/>routes/sessions.ts"]
    OFF["Off-record filter<br/>privacy/offRecord.ts"]
    TXT["Transcript redaction<br/>privacy/transcript.ts"]
    FR["Frame pipeline<br/>pipeline/frames.ts"]
    CUR["Curiosity Engine<br/>curiosity/*"]
    DBR["End, debrief, teach-back<br/>routes/debrief.ts"]
    WMB["Work Map builder + verifier<br/>workmap/build.ts, verify.ts"]
    WMR["Work Map routes<br/>get, patch, publish, markdown, predictions"]
    GRD["POST /guard/presave<br/>routes/guard.ts, llm/judge.ts"]
    TCH["Predictions + mastery<br/>routes/teach.ts, mastery/compute.ts"]
    EXP["Agent export + /copilot/run<br/>routes/export.ts"]
    REC["PUT/GET /sessions/:id/recording<br/>routes/recording.ts"]
    STORE[("Store<br/>store/jsonl.ts over store/memory.ts")]
  end

  EL[("ElevenAgents<br/>interviewer, tutor")]
  CL[("Claude API<br/>llm/structured.ts")]
  PRT[("Presidio analyzer + anonymizer")]
  PRI[("Presidio image redactor")]
  S3[("S3: RustFS locally, R2 hosted")]

  SU -- "signed URL" --> VOICE
  VOICE <-- "audio, transcript, vad_score" --> EL
  CAP -- frame --> WS
  DS -- desk_event --> WS
  VOICE -- transcript --> WS
  WS --> OFF
  OFF --> TXT --> PRT
  OFF --> FR --> PRI
  FR -- "redacted JPEG" --> S3
  FR -- "vision@2" --> CL
  FR -- "decision seen" --> CUR
  WS -- desk_event --> CUR
  CUR -- "curiosity@1" --> CL
  CUR -- candidate_question --> GATE
  FR -- "screen_event, insight" --> INS
  GATE -- "[ASK]" --> VOICE
  TXT --> STORE
  CAP -- "redacted webm" --> REC --> S3
  DEB --> DBR --> WMB
  WMB -- "workmap@1" --> CL
  DBR -- "teachback@1" --> CL
  WMB --> STORE
  MAPV --> WMR --> STORE
  MAPV -- "clip, Range" --> REC
  DS -- "pre-save" --> GRD
  GRD -- "judge@1" --> CL
  GRD -- verdict --> TUT
  TUT -- "[PREDICT], [INTERVENE]" --> VOICE
  TUT --> TCH --> STORE
  COP --> EXP --> GRD
  STORE -- "snapshot mirror" --> S3
```

Notes:

- Every Claude call goes through [`llm/structured.ts`](../apps/api/src/llm/structured.ts): a versioned route from [`packages/prompts`](../packages/prompts/src/index.ts), a Zod output schema, server-side fallback, and a typed `LlmError` on refusal, `max_tokens` or unparseable output. Effort is per route: vision, curiosity and the judge run low, teach-back medium, the Work Map builder high.
- WebSocket messages are Zod-validated on both ends ([`protocol.ts`](../packages/schema/src/protocol.ts), [`lib/stream.ts`](../apps/web/src/lib/stream.ts)).
- The guard is one function, `runGuard` in [`llm/judge.ts`](../apps/api/src/llm/judge.ts), shared by `/guard/presave`, `/copilot/run` and `pnpm eval:tutor`. Machine rules from the published map run first ([`packages/guard`](../packages/guard/src/index.ts)). For a refund, reply or close they did not block, the judge checks the action against all of the map's guardrails. The judge can only make a verdict stricter and must cite an existing guardrail. When no map is published, the guard uses [`seed/reference-guardrails.json`](../seed/reference-guardrails.json) only if `DEMO_FALLBACK_RULES=1`, and never calls the judge.
- Persistence: the in-memory store is flushed every second as JSONL snapshots under `infra/data/state`, mirrored to S3/R2 when configured, and replayed on boot ([`store/jsonl.ts`](../apps/api/src/store/jsonl.ts), wired in [`main.ts`](../apps/api/src/main.ts)). Postgres runs in [`infra/docker-compose.yml`](../infra/docker-compose.yml) but no code uses it.
- Without `ANTHROPIC_API_KEY`: frames are stored redacted but not sent to vision, the Curiosity Engine is not started, the debrief routes answer `503 llm_unavailable`, and the guard uses machine rules only ([`app.ts`](../apps/api/src/app.ts)).
- `MOCK_AI=1` replaces Claude and Presidio with [seed fixtures](../seed/fixtures): a fixture question 3 s after each committed action, fixture debrief and teach-back, the sample map behind the real Work Map, teach and export routes. No frames are stored. The Playwright suite runs in this mode.

## One capture session

```mermaid
sequenceDiagram
  autonumber
  actor E as Expert
  participant W as Web /capture
  participant A as API
  participant P as Presidio
  participant S as S3
  participant C as Claude
  participant V as ElevenAgents interviewer

  W->>A: GET /tickets?set=expert, POST /sessions {mode: capture}
  W->>A: WS hello -> ready
  E->>W: Start, share this tab
  W->>W: /api/eleven/signed-url?agent=interviewer
  W->>V: start conversation (signed URL)
  loop every 1.5 s
    W->>W: crop to DeskSim, black out [data-pii], dHash
    W->>A: frame (only if Hamming distance >= 6)
    A->>P: image redaction
    alt redaction fails
      A->>A: drop frame (not stored, not sent to a model)
    else
      A->>S: store redacted JPEG
      A->>C: vision@2 on the redacted JPEG (one call in flight)
      A-->>W: screen_event, insight
      W->>V: sendContextualUpdate "[SCREEN mm:ss] ..."
    end
  end
  E->>W: works a ticket (typing, clicking, saving)
  W->>V: sendUserActivity
  W->>A: desk_event action_committed
  A->>A: Curiosity Engine opens gaps and ranks them
  A->>C: curiosity@1 phrases the top gap
  A-->>W: candidate_question
  W->>W: Turn Gate every 250 ms until open
  W->>V: [ASK] question
  W->>A: question_asked
  V->>E: asks
  E->>V: answers
  W->>A: transcript segment
  A->>P: text redaction, then store
  E->>W: End task
  W->>A: PUT /sessions/:id/recording (redacted canvas webm)
  W->>A: POST /sessions/:id/end
  A->>C: workmap@1 draft
  A->>A: verify evidence, one repair pass, failures -> open questions
  A-->>W: workMapId, coverage, open questions (+ unseen-case probes)
  loop until done (coverage >= 0.9, no question >= 0.7, >= 3 answers, cap 8)
    W->>V: [DEBRIEF] next question
    E->>V: answers
    W->>A: POST /sessions/:id/debrief/answer (segment ids)
    A->>C: rebuild and re-verify the map
  end
  W->>A: POST /sessions/:id/teachback
  A->>C: teachback@1
  W->>V: [TEACHBACK] text
  E->>V: confirms, or corrects (at most two rounds)
  W->>A: POST /sessions/:id/teachback/confirm
  W->>A: POST /workmaps/:id/predictions (two variants, no model)
  E->>W: reviews the map, deletes what is wrong, publishes
  W->>A: PATCH /workmaps/:id, POST /workmaps/:id/publish
```

Code for each step:

| Step | Code |
| --- | --- |
| Session and stream | [`CaptureSession.tsx`](../apps/web/src/app/capture/CaptureSession.tsx), [`lib/stream.ts`](../apps/web/src/lib/stream.ts), [`routes/sessions.ts`](../apps/api/src/routes/sessions.ts) |
| Frame capture and change filter | [`frameLoop.ts`](../apps/web/src/lib/capture/frameLoop.ts), [`dhash.ts`](../apps/web/src/lib/capture/dhash.ts), [`snapshot.ts`](../apps/web/src/lib/capture/snapshot.ts) |
| Redacted recording | [`redactedStream.ts`](../apps/web/src/lib/capture/redactedStream.ts), [`recorder.ts`](../apps/web/src/lib/capture/recorder.ts), [`routes/recording.ts`](../apps/api/src/routes/recording.ts) |
| Frame redaction, storage, vision | [`frames.ts`](../apps/api/src/pipeline/frames.ts), [`presidioImage.ts`](../apps/api/src/privacy/presidioImage.ts), [`vision.ts`](../apps/api/src/llm/vision.ts) |
| Insight numbers | [`metrics.ts`](../apps/api/src/pipeline/metrics.ts), [`InsightPanel.tsx`](../apps/web/src/components/insight/InsightPanel.tsx) |
| Gaps, priority, phrasing, probes | [`ledger.ts`](../apps/api/src/curiosity/ledger.ts), [`engine.ts`](../apps/api/src/curiosity/engine.ts), [`probes.ts`](../apps/api/src/curiosity/probes.ts) |
| When to speak | [`turnGate.ts`](../apps/web/src/lib/turnGate.ts), [`useTurnGate.ts`](../apps/web/src/lib/gate/useTurnGate.ts) |
| Voice | [`useVoice.ts`](../apps/web/src/lib/voice/useVoice.ts), [`protocol.ts`](../apps/web/src/lib/voice/protocol.ts), [`agents/interviewer.md`](../agents/interviewer.md) |
| Transcript redaction and spoken off-record | [`transcript.ts`](../apps/api/src/privacy/transcript.ts), [`presidio.ts`](../apps/api/src/privacy/presidio.ts), [`offRecord.ts`](../apps/api/src/privacy/offRecord.ts) |
| Map build and verification | [`build.ts`](../apps/api/src/workmap/build.ts), [`verify.ts`](../apps/api/src/workmap/verify.ts), [`normalize.ts`](../apps/api/src/workmap/normalize.ts) |
| Debrief, teach-back, predictions | [`routes/debrief.ts`](../apps/api/src/routes/debrief.ts), [`predictions.ts`](../apps/api/src/workmap/predictions.ts), [`debrief/machine.ts`](../apps/web/src/components/debrief/machine.ts), [`debrief/useDebrief.ts`](../apps/web/src/components/debrief/useDebrief.ts) |
| Edit and publish | [`routes/workmaps.ts`](../apps/api/src/routes/workmaps.ts), [`WorkMapView.tsx`](../apps/web/src/components/workmap/WorkMapView.tsx) |

Off the record at any point: the browser pauses the frame loop and the recorder and stops sending transcript, desk events and screen context. The API drops any message timed inside an off-record span. The agent's prompt tells it to say "Okay, off the record" and stay silent. During capture the guard is consulted but never blocks: the expert's action always goes through.

## One teach session

```mermaid
sequenceDiagram
  autonumber
  actor L as New hire
  participant W as Web /teach
  participant A as API
  participant C as Claude (judge)
  participant T as ElevenAgents tutor

  W->>A: GET /workmaps/published (or /workmaps/:id with ?workMap=)
  W->>A: GET /tickets?set=new_hire, POST /sessions {mode: teach, workMapId}
  W->>T: start conversation (signed URL)
  L->>W: opens a ticket
  W->>W: matchJudgment(map, ticket)
  W->>T: [PREDICT] step and ticket
  T->>L: "What would you do here, and why?"
  L->>W: picks a prediction
  W->>A: POST /sessions/:id/predictions
  A-->>W: correct or not, expert's quote and frame
  L->>W: picks an outcome, saves
  W->>A: POST /guard/presave (x-shadow-session)
  A->>A: machine rules from the published map
  opt refund, reply or close not already blocked, key set
    A->>C: judge@1 (case facts, no customer name or email)
    C-->>A: verdict citing existing guardrail ids, or timeout after 2.5 s
  end
  A->>A: record the verdict on the session
  alt ALLOW
    A-->>W: ALLOW -> DeskSim commits
  else BLOCK
    A-->>W: BLOCK, ruleIds, expectedOutcome
    W->>W: DeskSim keeps the action uncommitted, "Paused by Shadow"
    W->>T: [INTERVENE] quote, frameId, expected outcome
    T->>L: "Maya would stop here. Why do you think?"
    T->>W: client tool replay_clip(frameId)
    W->>A: GET /sessions/:expertSession/recording (Range)
    W->>L: plays the expert's clip with the verbatim quote
  end
  L->>W: Finish
  W->>A: GET /sessions/:id/mastery
  A-->>W: computed from predictions, verdicts and commits
  W->>L: independent, assisted, missed, practise next
```

| Step | Code |
| --- | --- |
| Session, map loading, guard call, intervention | [`TeachSession.tsx`](../apps/web/src/app/teach/TeachSession.tsx) |
| Judgment points, intervention payload, clip lookup | [`tutor/logic.ts`](../apps/web/src/components/tutor/logic.ts) |
| Save interception | [`DeskSim.tsx`](../apps/web/src/components/desk/DeskSim.tsx) |
| Guard and judge | [`routes/guard.ts`](../apps/api/src/routes/guard.ts), [`llm/judge.ts`](../apps/api/src/llm/judge.ts), [`packages/guard`](../packages/guard/src/index.ts) |
| Predictions and mastery | [`routes/teach.ts`](../apps/api/src/routes/teach.ts), [`mastery/compute.ts`](../apps/api/src/mastery/compute.ts) |
| Panels | [`InterventionPanel.tsx`](../apps/web/src/components/tutor/InterventionPanel.tsx), [`PredictPanel.tsx`](../apps/web/src/components/tutor/PredictPanel.tsx), [`ClipOverlay.tsx`](../apps/web/src/components/tutor/ClipOverlay.tsx), [`MasteryReport.tsx`](../apps/web/src/components/tutor/MasteryReport.tsx) |
| Tutor prompt | [`agents/tutor.md`](../agents/tutor.md) |

If the judge times out, the API returns an explicit `timeout_allow` verdict and the page shows a warning. If the API does not answer within 6 s, the page allows the save and says it was not checked. Neither case is silent.

## Deployment

Web on Cloudflare Workers (OpenNext) at <https://shadow-web.tanbirramim420.workers.dev>. API and Presidio in one Docker image on Render's free web service. Details and the alternatives: [DEPLOY.md](DEPLOY.md), [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).
