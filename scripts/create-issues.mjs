// Creates one GitHub issue per backlog row in docs/IMPLEMENTATION_PLAN.md §10.
// Dry run by default; pass --apply to create. Requires `gh auth login` and a GitHub remote.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const plan = readFileSync(new URL("../docs/IMPLEMENTATION_PLAN.md", import.meta.url), "utf8");
const section = plan.split("## 10. Backlog")[1]?.split("\n## ")[0] ?? "";
const rows = section
  .split("\n")
  .filter((l) => /^\| [A-Z]\d+ \|/.test(l))
  .map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim()),
  );

const gh = (args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
if (apply) {
  for (const [name, color] of [
    ["dev-a", "1f6feb"],
    ["dev-b", "8250df"],
    ["stretch", "bf8700"],
  ]) {
    try {
      gh(["label", "create", name, "--color", color, "--force"]);
    } catch {}
  }
}

for (const [id, title, owner, window, depends, done] of rows) {
  const labels = [owner === "A" ? "dev-a" : "dev-b", ...(id.startsWith("S") ? ["stretch"] : [])];
  const body = `**Window:** ${window}\n**Depends on:** ${depends}\n**Plan:** docs/IMPLEMENTATION_PLAN.md §10\n\n### Done when\n- [ ] ${done}\n- [ ] \`pnpm verify\` green, PR template filled`;
  const args = [
    "issue",
    "create",
    "--title",
    `[${id}] ${title}`,
    "--body",
    body,
    ...labels.flatMap((l) => ["--label", l]),
  ];
  if (apply) process.stdout.write(gh(args));
  else console.warn(`would create: [${id}] ${title}  (${labels.join(", ")})`);
}
console.warn(`${rows.length} issues ${apply ? "created" : "found (dry run; add --apply)"}`);
