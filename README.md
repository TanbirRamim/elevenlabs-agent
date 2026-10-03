# Shadow

**The AI apprentice for support escalations.** Shadow sits beside your best support lead while they triage tickets, asks *why* at the right moments, turns their judgment into an evidence-linked Work Map, and coaches every new agent to decide the way they would, stopping a wrong refund before it's saved.

Built for Hack-Nation × ElevenLabs, 7th Global AI Hackathon, Challenge 01 "The AI Apprentice".

| Capture | Map | Teach |
| --- | --- | --- |
| The expert works in a helpdesk; an ElevenLabs voice agent watches the screen and asks short questions only at real pauses. | A spoken debrief closes the gaps and ends with a teach-back the expert confirms. Every step links to its screen moment and the expert's own words. | A voice tutor watches the new hire, asks them to predict decisions, and pauses a save that breaks a guardrail, explaining it with the expert's reasoning and clip. |

## Quick start

```bash
nvm use                 # Node 22
corepack enable         # pnpm 12
pnpm install            # also installs git hooks
cp .env.example .env    # fill in keys (see CONTRIBUTING.md)
pnpm infra:up           # Postgres, MinIO, Presidio
pnpm dev                # web :3000, api :4000
pnpm verify             # lint + typecheck + tests
```

## Stack

TypeScript monorepo (pnpm + Turborepo) · Next.js 16 · Fastify 5 + WebSockets · Zod contracts shared end to end · ElevenAgents (interviewer + tutor) with Scribe v2 Realtime · Claude (`claude-opus-5-5`, per-route effort, structured outputs) · Microsoft Presidio · Postgres + S3-compatible storage · Vitest · Biome · GitHub Actions.

## Docs

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): architecture, specs, 24 h timeline, backlog
- [Product plan](docs/PRODUCT_PLAN.md): why this product, market fit, scope
- [Demo script](docs/demo-script.md)
- [Contributing](CONTRIBUTING.md) · [Rules for AI assistants](AGENTS.md)
