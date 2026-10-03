# Evals

| Eval | Command | Target | Status |
| --- | --- | --- | --- |
| Guard on reference rules | `pnpm eval:guard` | ≥ 90 % naive-mistake catch, 0 false blocks | in CI, passing (9/9, 0/16) |
| Guard on captured map | `pnpm eval:tutor` | N1 caught; ≥ 80 % on held-out | to build (B14) |
| Live question quality | `questions.csv`, rated by both devs | ≥ 90 % on-screen, at a pause, not screen-answerable | after each rehearsal |

Outputs go to `eval/out/` (gitignored). Paste summaries into PRs and `docs/prompt-changelog.md`.
