// Regenerates .github/CODEOWNERS from ownership.json. Run after editing ownership.json.
import { writeFileSync } from "node:fs";
import { ownership } from "./ownership.mjs";

const handle = (id) => {
  const gh = ownership.people[id]?.github;
  return gh ? `@${gh}` : null;
};
const everyone = Object.keys(ownership.people).map(handle).filter(Boolean).join(" ");
const lines = [
  "# Generated from ownership.json by scripts/sync-codeowners.mjs. Do not edit by hand.",
  "",
];
const entries = Object.entries(ownership.paths).sort(([a], [b]) => a.length - b.length);
for (const [path, owner] of entries) {
  const pattern = path === "" ? "*" : `/${path}`;
  const who = owner === "shared" || owner === "any" ? everyone : (handle(owner) ?? everyone);
  if (who) lines.push(`${pattern.padEnd(42)} ${who}`);
}
writeFileSync(new URL("../.github/CODEOWNERS", import.meta.url), `${lines.join("\n")}\n`);
console.warn("CODEOWNERS updated");
