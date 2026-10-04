// Captured-map eval (HAR-13). Runs the real pre-save guard (machine rules from the map, then
// the LLM judge when ANTHROPIC_API_KEY is set) over N1, N2 and H1-H10 with the "naive new hire"
// action, prints the catch rate and false blocks, and writes eval/out/tutor-<date>.json.
//
//   pnpm eval:tutor <workMapId|path/to/map.json> [--api http://localhost:4000] [--no-judge]
//
// A workMapId is fetched from a running API (GET /workmaps/:id; "published" works too).
// Exits 1 when N1 is missed, the held-out catch rate is under 80 %, or any expert outcome is blocked.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../apps/api/src/env.js";
import { runGuard } from "../apps/api/src/llm/judge.js";
import { createLlm } from "../apps/api/src/llm/structured.js";
import { findSeedDir, loadTickets } from "../packages/guard/src/fixtures.js";
import { type GuardVerdict, type Outcome, WorkMap } from "../packages/schema/src/index.js";

const TICKETS = ["N1", "N2", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10"];

function usage(): never {
  console.error("usage: pnpm eval:tutor <workMapId|path/to/map.json> [--api <url>] [--no-judge]");
  process.exit(2);
}

let target: string | undefined;
let apiUrl = "http://localhost:4000";
let noJudge = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--no-judge") noJudge = true;
  else if (a === "--api") apiUrl = process.argv[++i] ?? usage();
  else if (a && !a.startsWith("--") && target === undefined) target = a;
  else usage();
}
if (!target) usage();

async function loadMap(ref: string): Promise<WorkMap> {
  const path = resolve(process.cwd(), ref);
  if (ref.endsWith(".json") || existsSync(path)) {
    return WorkMap.parse(JSON.parse(readFileSync(path, "utf8")));
  }
  const url = `${apiUrl.replace(/\/+$/, "")}/workmaps/${encodeURIComponent(ref)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return WorkMap.parse(await res.json());
}

const map = await loadMap(target);
const env = loadEnv({ ...process.env, MOCK_AI: "0" });
// The same check as /guard/presave: machine rules, then the judge when a key is set.
const llm =
  noJudge || !env.ANTHROPIC_API_KEY ? null : createLlm(env.ANTHROPIC_API_KEY, env.SHADOW_MODEL);
const log = {
  warn: (obj: object, msg: string) => console.warn(`  ! ${msg} ${JSON.stringify(obj)}`),
};

interface Row {
  ticketId: string;
  set: string;
  expected: Outcome;
  labelGuardrails: string[];
  naive: Outcome;
  naiveVerdict: GuardVerdict | null;
  caught: boolean | null;
  expertVerdict: GuardVerdict;
  falseBlock: boolean;
}

const all = loadTickets();
const rows: Row[] = [];
for (const id of TICKETS) {
  const found = all.find((t) => t.id === id);
  if (!found?.label) throw new Error(`seed ticket ${id} is missing or unlabelled`);
  const { label, ...ticket } = found;
  const guard = (outcome: Outcome) =>
    runGuard(
      {
        ticket,
        outcome,
        ...(ticket.amountEur !== undefined ? { amountEur: ticket.amountEur } : {}),
      },
      { map, fallbackRules: [], llm, judge: { log } },
    );
  const naive: Outcome = ticket.amountEur !== undefined ? "refund" : "reply";
  const scored = naive !== label.outcome && label.guardrails.length > 0;
  const naiveVerdict = scored ? await guard(naive) : null;
  const expertVerdict = await guard(label.outcome);
  rows.push({
    ticketId: id,
    set: label.set,
    expected: label.outcome,
    labelGuardrails: label.guardrails,
    naive,
    naiveVerdict,
    caught: naiveVerdict ? naiveVerdict.decision !== "ALLOW" : null,
    expertVerdict,
    falseBlock: expertVerdict.decision === "BLOCK",
  });
}

const scoredRows = rows.filter((r) => r.caught !== null);
const caught = scoredRows.filter((r) => r.caught).length;
const heldOut = scoredRows.filter((r) => r.set === "held_out");
const heldOutCaught = heldOut.filter((r) => r.caught).length;
const falseBlocks = rows.filter((r) => r.falseBlock).length;
const n1 = rows.find((r) => r.ticketId === "N1");
const n1Caught = n1?.caught === true;
const pct = (a: number, b: number) => (b === 0 ? 100 : Math.round((a / b) * 100));

const fmt = (v: GuardVerdict | null) =>
  v ? `${v.decision}${v.ruleIds.length ? ` [${v.ruleIds.join(",")}]` : ""} via ${v.source}` : "-";
console.warn(
  `eval:tutor on ${map.id} v${map.version} (${map.guardrails.length} guardrails, ` +
    `${map.guardrails.filter((g) => g.machineRule).length} with machine rules), judge ${llm ? `on (${env.SHADOW_MODEL})` : "off"}`,
);
for (const r of rows) {
  const naive =
    r.caught === null ? "not scored" : `${r.caught ? "caught" : "MISSED"} ${fmt(r.naiveVerdict)}`;
  console.warn(
    `  ${r.ticketId.padEnd(4)} naive ${r.naive.padEnd(7)} -> ${naive}; expert ${r.expected} -> ${fmt(r.expertVerdict)}${r.falseBlock ? " FALSE BLOCK" : ""}`,
  );
}
console.warn(
  `catch rate on naive wrong actions: ${pct(caught, scoredRows.length)}% (${caught}/${scoredRows.length})`,
);
console.warn(
  `held-out catch rate: ${pct(heldOutCaught, heldOut.length)}% (${heldOutCaught}/${heldOut.length})`,
);
console.warn(`N1 caught: ${n1Caught ? "yes" : "NO"}`);
console.warn(`false blocks on expert outcomes: ${falseBlocks}/${rows.length}`);

const repoRoot = dirname(findSeedDir(dirname(fileURLToPath(import.meta.url))));
const outDir = join(repoRoot, "eval", "out");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "");
const outFile = join(outDir, `tutor-${stamp}.json`);
writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      workMap: { id: map.id, version: map.version, guardrails: map.guardrails.map((g) => g.id) },
      judge: llm ? { model: env.SHADOW_MODEL } : null,
      summary: {
        caught,
        scored: scoredRows.length,
        catchRate: caught / Math.max(1, scoredRows.length),
        heldOutCaught,
        heldOutScored: heldOut.length,
        n1Caught,
        falseBlocks,
        tickets: rows.length,
      },
      rows,
    },
    null,
    2,
  )}\n`,
);
console.warn(`wrote ${outFile}`);
process.exit(n1Caught && falseBlocks === 0 && pct(heldOutCaught, heldOut.length) >= 80 ? 0 : 1);
