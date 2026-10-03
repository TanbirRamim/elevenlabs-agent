# ElevenAgents configuration (config as code)

The two voice agents are configured in the ElevenLabs dashboard, but **this folder is the source
of truth**. Whoever changes an agent in the dashboard copies the change here in the same PR.

| Agent | File | Env var |
| --- | --- | --- |
| Interviewer (Capture + Debrief) | `interviewer.md` | `ELEVENLABS_INTERVIEWER_AGENT_ID` |
| Tutor (Teach) | `tutor.md` | `ELEVENLABS_TUTOR_AGENT_ID` |

Dashboard settings to apply to both:

- LLM: Claude (latest available in the ElevenAgents LLM list); record the exact choice in this file.
- Voice: one calm voice, Expressive Mode on.
- System tools: enable `skip_turn`. Disable `end_call` for the Interviewer.
- Client tools (registered in `apps/web`): `replay_clip`, `show_step` (Tutor only).
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
