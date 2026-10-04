# ElevenAgents configuration (config as code)

The two voice agents are configured in the ElevenLabs dashboard, but **this folder is the source
of truth**. Whoever changes an agent in the dashboard copies the change here in the same PR.

| Agent | File | Env var | Agent id |
| --- | --- | --- | --- |
| Interviewer (Capture + Debrief) | `interviewer.md` | `ELEVENLABS_INTERVIEWER_AGENT_ID` | `agent_7801m429vwv5fv3bs3ky3nzp1qqd` |
| Tutor (Teach) | `tutor.md` | `ELEVENLABS_TUTOR_AGENT_ID` | `agent_2201m42a0vj6f2mv28ajk27qnpm1` |

Agent ids are identifiers, not secrets; the API key that signs conversation URLs stays in the
server environment only.

## Live configuration (v1, 2026-10-04)

Both agents:

- LLM: Claude Sonnet 5.5 (`claude-sonnet-5-5`), reasoning effort low, for conversational latency.
- Voice: Eric (ElevenLabs default), English. ASR: Scribe v2 Realtime, turn model Turn V3.
- System tools: `skip_turn` on; `end_call` off.
- Client events: `audio`, `interruption`, `user_transcript`, `agent_response`,
  `agent_response_correction`, `vad_score` (the Turn Gate reads the VAD score).
- Security: authentication on (only signed URLs from `/api/eleven/signed-url` can start a call),
  no client overrides.
- Privacy: call audio is not stored (`record_voice: false`); only the transcript is retained.

Tutor only:

- Client tool `replay_clip` with one required string parameter `frameId`, wait for response on.
- First message: "Hi {{learner_name}}, I'm Shadow. Work the queue as you normally would; I'll jump
  in only when it matters."

Dashboard settings to apply to both:

- LLM: Claude (latest available in the ElevenAgents LLM list); the exact choice is recorded below.
- Voice: one calm voice, Expressive Mode on.
- System tools: enable `skip_turn`. Disable `end_call` for the Interviewer.
- Client tools (registered in `apps/web`): `replay_clip` (Tutor only).
- Knowledge base (Tutor only): the published Work Map, rendered to Markdown by `GET /workmaps/:id/markdown`.
- First message: Interviewer = "I'm here. Go ahead and work, I'll stay quiet and ask a few things at good moments."

Control protocol (sent by the web app with `sendUserMessage`, hidden from the transcript UI):

| Prefix | Meaning |
| --- | --- |
| `[ASK] <question>` | Turn Gate is open. Ask this question (you may rephrase, keep it under 20 words). |
| `[DEBRIEF] <json>` | Task ended. Run the debrief with these open questions. |
| `[TEACHBACK] <text>` | Read this explanation back and ask the expert to confirm or correct it. |
| `[INTERVENE] <json>` | Tutor only: a pre-save guard blocked an action. Coach using the cited quote. |
| `[PREDICT] <json>` | Tutor only: ask the new hire to predict the decision at this step. |

Screen events arrive with `sendContextualUpdate` as `[SCREEN mm:ss] ...` and never require a reply.
