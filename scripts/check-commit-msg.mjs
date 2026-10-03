// Enforces Conventional Commits with an area scope, e.g. "feat(api): add vision extractor".
import { readFileSync } from "node:fs";

const msg = readFileSync(process.argv[2], "utf8").split("\n")[0] ?? "";
const scopes = [
  "web",
  "api",
  "schema",
  "guard",
  "prompts",
  "agents",
  "desk",
  "infra",
  "docs",
  "ci",
  "seed",
  "eval",
  "repo",
];
const re = new RegExp(
  `^(feat|fix|chore|docs|test|refactor|perf|ci|build)\\((${scopes.join("|")})\\)!?: .{3,72}$`,
);
if (!re.test(msg) && !msg.startsWith("Merge ")) {
  console.error(
    `Bad commit message: "${msg}"\nExpected: type(scope): summary\n  types: feat fix chore docs test refactor perf ci build\n  scopes: ${scopes.join(" ")}`,
  );
  process.exit(1);
}
