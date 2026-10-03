// Blocks commits that contain API keys. Cheap guard; CI runs the same check on the whole tree.
import { existsSync, readFileSync, statSync } from "node:fs";

const patterns = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic
  /\bsk_[a-f0-9]{40,}\b/, // ElevenLabs
  /xi-api-key["':\s]+[A-Za-z0-9]{20,}/i,
];
const files = process.argv.slice(2).filter((f) => existsSync(f) && statSync(f).isFile());
let bad = false;
for (const f of files) {
  if (f.endsWith(".env.example") || f.includes("check-secrets")) continue;
  const text = readFileSync(f, "utf8");
  for (const p of patterns) {
    if (p.test(text)) {
      console.error(`Possible secret in ${f} (${p})`);
      bad = true;
    }
  }
}
process.exit(bad ? 1 : 0);
