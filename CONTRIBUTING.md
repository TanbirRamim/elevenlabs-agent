# Contributing

Two developers, 24 hours, `main` always demoable. Read `AGENTS.md` too; its rules apply to humans.

## One-time setup (both, before H0:45)

1. Install Node 22, Docker, and enable pnpm: `corepack enable`.
2. Clone, then `pnpm install && pnpm verify`. It must be green.
3. Replace `@dev-a` / `@dev-b` in `.github/CODEOWNERS` with your GitHub handles (one PR).
4. Copy `.env.example` → `.env`, fill from the shared vault entry. Never paste keys in chat.
5. `pnpm infra:up` and open http://localhost:3000.
6. GitHub settings on `main`: require PRs, require the `CI / verify` check, allow squash merge only, auto-delete branches.

## Daily loop

```bash
git switch main && git pull --rebase
git switch -c a/turn-gate-wiring        # a/ = Dev A, b/ = Dev B
# … small commits: feat(web): wire turn gate signals
pnpm verify
git push -u origin HEAD && gh pr create --fill
```

- One issue per branch, branches live < 3 hours, PRs ideally < 300 changed lines.
- Review within 10 minutes. In your own area with green CI you may self-merge and label `post-merge-review`.
- `packages/schema` changes: separate PR, both approve, bump `PROTOCOL_VERSION` if breaking.
- Prompt changes: bump the version, add a line to `docs/prompt-changelog.md`, paste the eval result.
- Checkpoints at H4, H9, H14, H19: merge everything, demo the gate together, re-plan.

## Commit messages

`type(scope): summary`. Types: feat fix chore docs test refactor perf ci build. Scopes: web api schema guard prompts agents desk infra docs ci seed eval repo. The commit-msg hook enforces it.

## Backlog

`scripts/create-issues.sh` creates every backlog item from `docs/IMPLEMENTATION_PLAN.md` §10 as a GitHub issue with owner labels and milestones.
