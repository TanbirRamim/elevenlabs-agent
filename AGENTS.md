# Rules for AI coding assistants (Claude Code, Codex, Copilot, Cursor, …)

This file is binding for every AI assistant working in this repo. `CLAUDE.md` and
`.github/copilot-instructions.md` point here. Humans: these are your rules too.

We have 24 hours and no time to debug invented code. **A wrong answer stated confidently costs
more than "I don't know."**

## 0. Before you write anything

1. Work from one GitHub issue (ask your human which one if it isn't stated). Do **only** that task.
2. Read every file under the task's **Reads** and the files you will touch. The contracts in `packages/schema/src/` and `apps/web/src/components/desk/types.ts` are the source of truth.
3. Change only paths under the task's **Owns**. `ownership.json` maps every path to an owner, and CI fails a PR that touches another owner's files.
4. If the task, the plan and the code disagree, **stop and ask**. Do not pick one silently.

## 1. Anti-hallucination rules (hard rules)

| Never invent… | Instead |
| --- | --- |
| A package or version | `pnpm --filter <pkg> add <name>`; pnpm resolves the version. Never hand-edit versions or the lockfile. |
| An SDK method, option or type | Check the installed types: `grep -rn "<name>" node_modules/<pkg>/**/*.d.ts`, or the official docs linked in `docs/IMPLEMENTATION_PLAN.md` §11. If you can't find it, say so. |
| An ElevenLabs API | Only these are verified: `@elevenlabs/react` `useConversation` (`startSession`, `endSession`, `sendContextualUpdate`, `sendUserMessage`, `sendUserActivity`, `clientTools`, `onMessage`, `onModeChange`, `isSpeaking`, `status`), signed URL `GET /v1/convai/conversation/get-signed-url`, system tool `skip_turn`. Anything else: verify in `node_modules/@elevenlabs/*` types first. |
| A Claude model ID or API shape | The model comes from `SHADOW_MODEL`. All Claude calls go through `apps/api/src/llm/structured.ts`. Do not add a second client. |
| An env var | It must exist in `.env.example` **and** the env schema (`apps/api/src/env.ts` or `apps/web/src/env.ts`). Add it to both in the same PR. |
| A file path, script or command | `ls` / `cat package.json` first. Only run scripts that exist. |
| A schema field | Fields come from `packages/schema`. Changing a contract follows §4. |
| Test results | Run the command and paste the real output. Never write "tests pass" without running them. |
| A ticket, quote, timestamp or rule in demo data | Only `seed/` holds demo data. Product code never hard-codes ticket IDs or guardrails. |

If you are unsure after one lookup, **say "I'm not sure" and name what you'd need to check.**
After two failed attempts at the same fix, stop and report what you tried. Don't loop.

## 2. Scope rules

- Touch only files your task owns. A needed change elsewhere is reported to your human, not made. No drive-by refactors, renames or reformatting of unrelated code.
- Shared paths (`packages/schema/`, `apps/web/src/components/desk/types.ts`, `package.json` files, root config) change only in a separate PR labelled `shared-change`.
- No new dependencies without a one-line reason in the PR. Prefer what's already installed.
- No placeholders presented as done: no `TODO` without an issue number, no mocked data in production code paths, no `return true // works for demo`.
- Don't delete or weaken tests to make them pass. Fix the code, or explain in the PR why the test was wrong.

## 3. Code rules

- TypeScript strict. No `any`, no `@ts-ignore` / `@ts-expect-error` without a comment that says why.
- Validate every external input with Zod at the boundary (HTTP body, WebSocket message, LLM output, env, JSON files).
- LLM output is untrusted input: always through `structured()` with a schema; handle `LlmError`.
- Never log secrets, raw frames, or transcript text at `info` level. Use the Fastify logger, not `console.log`.
- Secrets live only in `.env` (gitignored). Never print, commit, or paste keys into code, tests, docs or chat.
- The ElevenLabs API key never reaches the browser. The browser gets a signed URL from `/api/eleven/signed-url`.
- Pure logic (Turn Gate, guard engine, scoring) stays pure and gets unit tests.

## 4. Contract changes (`packages/schema`)

Contracts are shared by both developers. To change one:

1. Open a PR that changes **only** `packages/schema` (plus its tests).
2. Breaking WebSocket change → bump `PROTOCOL_VERSION`.
3. Both owners approve. Then both rebase.

## 5. Prompt and agent changes

- LLM prompts live in `packages/prompts`. Change one → bump its `version`, add a line to `docs/prompt-changelog.md`, re-run the relevant eval and paste the result in the PR.
- ElevenAgents system prompts live in `agents/*.md`. If you changed the dashboard, mirror it there in the same PR.

## 6. Definition of done (every PR)

```bash
pnpm verify        # lint + typecheck + test, must pass
pnpm eval:guard    # if you touched guard, seed or schema
```

Plus: browser-tested if it's UI, PR template filled in honestly.

## 7. Git

- Branch from `main` using the branch name in the task (`tanbir/...` or `harshit/...`; CI uses the prefix to check ownership). Small PRs (aim for under 300 changed lines).
- Conventional commits with scope, enforced by a hook: `feat(api): add vision extractor`.
- Never `--no-verify`, never force-push `main`, never commit generated files (`dist/`, `.next/`).
- No AI co-author trailers or "generated with" lines in commits or PRs.

## 8. Commands you may rely on

| Command | What it does |
| --- | --- |
| `pnpm dev` | web on :3000, api on :4000 |
| `pnpm infra:up` / `infra:down` | Postgres, MinIO, Presidio via Docker |
| `pnpm verify` | lint + typecheck + test |
| `pnpm format` | Biome auto-fix |
| `pnpm eval:guard` | guardrail catch-rate eval on seed tickets |
| `pnpm --filter <pkg> test` | one package's tests |

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
