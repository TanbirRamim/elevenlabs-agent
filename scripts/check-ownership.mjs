// CI gate: a PR may only change files its author owns (by branch prefix), plus "any" paths.
// Shared paths need the PR label "shared-change". Usage (CI sets these env vars):
//   BRANCH=harshit/vision BASE=origin/main LABELS="shared-change" node scripts/check-ownership.mjs
import { execFileSync } from "node:child_process";
import { ownerOf, personForBranch } from "./ownership.mjs";

const branch = process.env.BRANCH ?? "";
const base = process.env.BASE ?? "origin/main";
const labels = (process.env.LABELS ?? "").split(",").map((l) => l.trim());
const person = personForBranch(branch);

if (!person) {
  console.error(`Branch "${branch}" must start with tanbir/ or harshit/ (see CONTRIBUTING.md).`);
  process.exit(1);
}

const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`])
  .toString()
  .split("\n")
  .filter(Boolean);
const problems = [];
let touchesShared = false;
for (const f of files) {
  const owner = ownerOf(f);
  if (owner === "any" || owner === person) continue;
  if (owner === "shared") {
    touchesShared = true;
    if (!labels.includes("shared-change"))
      problems.push(`${f}: shared, needs the "shared-change" label`);
    continue;
  }
  problems.push(`${f}: owned by ${owner}`);
}

if (problems.length) {
  console.error(`Ownership check failed for ${person} (${branch}):\n  ${problems.join("\n  ")}`);
  console.error("Move the change to the owner's task, or split shared changes into their own PR.");
  process.exit(1);
}
console.warn(
  `ownership ok: ${files.length} files, author ${person}${touchesShared ? ", shared-change approved by label" : ""}`,
);
