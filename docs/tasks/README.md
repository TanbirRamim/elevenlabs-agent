# Task files

| Workstream | Owner | File |
| --- | --- | --- |
| Voice, capture, debrief, Work Map UI, tutor, insight panel | Tanbir Ramim | [tanbir.md](tanbir.md) |
| DeskSim, API, vision pipeline, Curiosity Engine, Work Map builder, guard, persistence, deploy | Harshit | [harshit.md](harshit.md) |

## How to use these with a coding agent

Give your agent this prompt at the start of each task:

> Read `AGENTS.md`, then `docs/tasks/<your-name>.md`, task **<ID>** only. Work on branch `<branch from the task>`. Change only the paths listed under **Owns**. Treat **Reads** as read-only contracts. When the **Acceptance** checks pass, open a PR using the template, with the real command output pasted in. If the task needs a change outside **Owns**, stop and tell me instead of making it.

## Rules that keep the two workstreams from colliding

1. **Folders, not files, are owned.** `ownership.json` maps every path to `tanbir`, `harshit`, `shared` or `any`. CI's `ownership` job fails any PR that touches the other person's paths.
2. **Shared paths** (`packages/schema/`, `apps/web/src/components/desk/types.ts`, root config, `package.json` files) change only in a dedicated PR labelled `shared-change`, approved by both.
3. **Interfaces are already frozen:** REST and WebSocket in `packages/schema/src/{api,protocol}.ts`, and the DeskSim component in `apps/web/src/components/desk/types.ts`. Build against them; don't work around them.
4. **Nobody waits on anybody.** Harshit's mock mode (`MOCK_AI=1`, task HAR-3) serves realistic fixture data on every endpoint, so Tanbir's UI works before the real pipeline exists. DeskSim already renders a placeholder that honours its props.
5. **All dependencies are pre-installed.** Adding one is a `shared-change` PR. If `pnpm-lock.yaml` conflicts on rebase, take `main`'s version and run `pnpm install`.
6. **Checkpoints** at H4, H9, H14, H19: merge everything open, run the gate demo together.
