# Shadow: Claude Code instructions

@AGENTS.md

## Claude Code specifics

- Plan before multi-file changes: list the files you'll touch and why, then proceed.
- Prefer `pnpm --filter <pkg> test` while iterating; run `pnpm verify` before saying you're done.
- When unsure about a library API, read its `.d.ts` in `node_modules` before writing code.
- Keep your final message short: what changed, the verification output, anything left open.
