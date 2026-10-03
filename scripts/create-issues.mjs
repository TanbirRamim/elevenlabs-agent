// Creates one GitHub issue per task in docs/tasks/{tanbir,harshit}.md.
// Dry run by default; pass --apply to create. Requires `gh auth login` and the GitHub remote.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const repo = "https://github.com/TanbirRamim/elevenlabs-agent/blob/main";
const gh = (args) => execFileSync("gh", args, { stdio: ["ignore", "pipe", "inherit"] }).toString();

const owners = [
  { id: "tanbir", file: "docs/tasks/tanbir.md", color: "1f6feb" },
  { id: "harshit", file: "docs/tasks/harshit.md", color: "8250df" },
];

if (apply) {
  for (const { id, color } of owners) gh(["label", "create", id, "--color", color, "--force"]);
  gh(["label", "create", "stretch", "--color", "bf8700", "--force"]);
  gh([
    "label",
    "create",
    "shared-change",
    "--color",
    "d73a4a",
    "--force",
    "--description",
    "Touches shared paths; both owners approve",
  ]);
  gh(["label", "create", "post-merge-review", "--color", "fbca04", "--force"]);
}

let count = 0;
for (const { id, file } of owners) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const tasks = text.split(/\n(?=## [A-Z]+-\d+ · )/).filter((t) => t.startsWith("## "));
  for (const task of tasks) {
    const heading = task.split("\n")[0].replace(/^## /, "");
    const [taskId] = heading.split(" · ");
    if (taskId.endsWith("-0")) continue; // setup tasks are done together at kickoff
    const meta =
      task.split("\n").find((l) => l.startsWith("**Window:**") || l.startsWith("**Branch:**")) ??
      "";
    const anchor = heading
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .replace(/ /g, "-");
    const body = `${meta}\n\nFull spec: [${file}#${taskId}](${repo}/${file}#${anchor})\n\nDone when the task's **Acceptance** checks pass and \`pnpm verify\` is green.`;
    const labels = [id, ...(/stretch/i.test(heading) ? ["stretch"] : [])];
    const args = [
      "issue",
      "create",
      "--title",
      heading,
      "--body",
      body,
      ...labels.flatMap((l) => ["--label", l]),
    ];
    if (apply) process.stdout.write(gh(args));
    else console.warn(`would create: ${heading}  [${labels.join(", ")}]`);
    count++;
  }
}
console.warn(`${count} issues ${apply ? "created" : "found (dry run; add --apply)"}`);
