# Contributing

Team: **Tanbir Ramim** (voice, capture, every page people see) and **Harshit** (DeskSim, API, reasoning pipeline). `main` is always demoable. `AGENTS.md` applies to humans too.

## One-time setup

1. Node 22, Docker, and `corepack enable` (pnpm 12).
2. Clone, then `pnpm install && pnpm verify`. It must be green.
3. Copy `.env.example` to `.env` and fill it from the shared vault entry. Never paste keys in chat.
4. `pnpm infra:up`, `pnpm dev`, open http://localhost:3000.

## Who owns what

`ownership.json` is the source of truth; CI's `ownership` job enforces it on every PR, and `.github/CODEOWNERS` is generated from it (`node scripts/sync-codeowners.mjs`).

| Owner | Paths |
| --- | --- |
| Tanbir | `apps/web/` (except DeskSim), `agents/`, `docs/`, `README.md` |
| Harshit | `apps/web/src/components/desk/`, `apps/web/src/app/desk/`, `apps/api/`, `packages/guard/`, `packages/prompts/`, `seed/`, `eval/`, `infra/` |
| Shared (label `shared-change`, both approve) | `packages/schema/`, `apps/web/src/components/desk/types.ts`, `package.json` files, root config |

A PR that must touch both owners' areas (repo setup, an agreed cross-cutting fix) uses the `cross-owner` label and needs both approvals. It is the exception, not the workflow.

## Tasks

Your tasks are in `docs/tasks/tanbir.md` or `docs/tasks/harshit.md`. Each lists the paths it owns, the contracts it reads, its steps and its acceptance checks. `docs/tasks/README.md` has the prompt to give your coding agent.

## Daily loop

```bash
git switch main && git pull --rebase
git switch -c harshit/vision-queue        # tanbir/... or harshit/...
# small commits: feat(api): add vision queue
pnpm verify
git push -u origin HEAD && gh pr create --fill
```

- One task per branch; branches live under 3 hours; PRs ideally under 300 changed lines.
- Review within 10 minutes. In your own area with green CI you may self-merge and add the `post-merge-review` label.
- Shared changes go in their own PR with the `shared-change` label; breaking WebSocket changes bump `PROTOCOL_VERSION`.
- Prompt changes bump the version, add a line to `docs/prompt-changelog.md`, and include the eval result.
- If `pnpm-lock.yaml` conflicts on rebase: `git checkout --theirs pnpm-lock.yaml && pnpm install`.

## Commit messages

`type(scope): summary`, enforced by a hook. Types: feat fix chore docs test refactor perf ci build. Scopes: web api schema guard prompts agents desk infra docs ci seed eval repo.

## Issues

`node scripts/create-issues.mjs` (dry run) / `--apply` creates one GitHub issue per task, labelled with its owner.
