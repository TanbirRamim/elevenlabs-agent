// Vision eval: does Claude read the screen into the right events?
//
// Drives the real DeskSim (/desk, which logs every DeskEvent from the DOM) in headless Chromium,
// captures a JPEG of the desk before and after each step the way /capture does (crop to the desk,
// scale to <= 1280 px wide, black out [data-pii], quality 0.7), sends each pair to the real vision
// extractor (apps/api/src/llm/vision.ts -> structured() -> SHADOW_MODEL), and scores the events it
// returns against the DeskEvents the DOM emitted for that step.
//
//   pnpm eval:vision [--web http://localhost:3000]
//
// Needs a running web (any API mode; /desk only needs GET /tickets) and ANTHROPIC_API_KEY.
// Server-side Presidio redaction is skipped: frames are already blacked out client-side.
// Writes eval/out/vision-<date>.json. Exits 1 when overall accuracy is under 80 %.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../apps/api/src/env.js";
import { createLlm } from "../apps/api/src/llm/structured.js";
import { extractEvents, type FrameInput } from "../apps/api/src/llm/vision.js";
import { outcomeFromText, ticketIdFrom } from "../apps/api/src/pipeline/metrics.js";
import { DeskEvent, type ScreenEvent, type VisionResult } from "../packages/schema/src/index.js";

type VisionEvent = VisionResult["events"][number];
const say = (line: string) => process.stdout.write(`${line}\n`);
type Truth = Exclude<DeskEvent, { type: "input_activity" }>;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Playwright is a dependency of the web app only.
const { chromium } = createRequire(join(root, "apps/web/package.json"))(
  "@playwright/test",
) as typeof import("@playwright/test");

let webUrl = "http://localhost:3000";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--web") webUrl = process.argv[++i] ?? webUrl;
}

const env = loadEnv({ ...process.env, MOCK_AI: "0" });
if (!env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set: the vision eval needs the real model.");
  process.exit(2);
}
const llm = createLlm(env.ANTHROPIC_API_KEY, env.SHADOW_MODEL);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${webUrl.replace(/\/+$/, "")}/desk`);
const desk = page.locator('[aria-label="Support inbox"]');
await desk.waitFor();
const queue = page.locator('nav[aria-label="Ticket queue"] button');
await queue.first().waitFor();

/** The DeskEvents the page has logged, oldest first. */
async function domEvents(): Promise<Truth[]> {
  const raw = await page.locator("ol li span.break-all").allTextContents();
  return raw
    .map((t) => DeskEvent.parse(JSON.parse(t)))
    .filter((e): e is Truth => e.type !== "input_activity")
    .reverse();
}

let frameSeq = 0;
/** A JPEG of the desk, encoded the way lib/capture/snapshot.ts encodes a /capture frame. */
async function capture(): Promise<FrameInput> {
  await page.mouse.move(0, 0); // no hover highlight in the frame
  const png = (await desk.screenshot({ animations: "disabled" })).toString("base64");
  const jpegBase64 = await page.evaluate(async (pngB64) => {
    const deskEl = document.querySelector('[aria-label="Support inbox"]');
    if (!deskEl) throw new Error("desk missing");
    const box = deskEl.getBoundingClientRect();
    const img = new Image();
    img.src = `data:image/png;base64,${pngB64}`;
    await img.decode();
    const k = img.width / box.width; // device pixels per CSS pixel
    const scale = Math.min(1, 1280 / img.width);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.fillStyle = "#000";
    for (const el of deskEl.querySelectorAll("[data-pii]")) {
      const r = el.getBoundingClientRect();
      const s = k * scale;
      ctx.fillRect(
        Math.floor((r.x - box.x) * s) - 1,
        Math.floor((r.y - box.y) * s) - 1,
        Math.ceil(r.width * s) + 2,
        Math.ceil(r.height * s) + 2,
      );
    }
    const url = c.toDataURL("image/jpeg", 0.7);
    return url.slice(url.indexOf(",") + 1);
  }, png);
  frameSeq += 1;
  return { frameId: `f${frameSeq}`, tMs: frameSeq * 1500, jpegBase64 };
}

const open = (id: string) => async () => {
  await page.locator(`#desk-queue-${id}`).click();
};
const setRefund = (value: string) => async () => {
  const input = page.locator('input[inputmode="decimal"]');
  await input.fill(value);
  await input.blur();
};
const typeReply = (text: string) => async () => {
  const box = page.getByLabel("Reply to the customer");
  await box.fill(text);
  await box.blur();
};
const commit = (label: string) => async () => {
  await page
    .getByRole("button", { name: new RegExp(label, "i") })
    .first()
    .click();
  await page
    .getByText(/Committed:/)
    .first()
    .waitFor({ timeout: 5000 });
};

const STEPS: { name: string; run: () => Promise<void> }[] = [
  { name: "open T1", run: open("T1") },
  { name: "T1 type reply", run: typeReply("Your September invoice is attached again.") },
  { name: "T1 commit Reply", run: commit("^\\d?\\s*Reply$") },
  { name: "open T2", run: open("T2") },
  { name: "T2 refund 49 -> 25", run: setRefund("25") },
  { name: "T2 commit Refund", run: commit("^\\d?\\s*Refund$") },
  { name: "open T3", run: open("T3") },
  { name: "T3 refund 240 -> 0", run: setRefund("0") },
  { name: "T3 commit Billing disputes", run: commit("Billing disputes") },
  { name: "open T4", run: open("T4") },
  { name: "T4 commit Security", run: commit("Security") },
];

const norm = (v: string | null | undefined) =>
  (v ?? "")
    .toLowerCase()
    .replace(/[€\s,]|eur/g, "")
    .replace(/\.0+$/, "");
const fieldKey = (f: string) => f.toLowerCase().replace(/[^a-z]/g, "");
const visionTicket = (e: VisionEvent) => ticketIdFrom(e.object);

interface Score {
  kind: Truth["type"];
  detected: boolean;
  exact: boolean;
  detail: string;
}

function score(truth: Truth, events: VisionEvent[]): Score {
  if (truth.type === "ticket_opened") {
    const hit = events.find((e) => e.kind === "opened" && visionTicket(e) === truth.ticketId);
    return { kind: truth.type, detected: !!hit, exact: !!hit, detail: hit?.object ?? "-" };
  }
  if (truth.type === "field_changed") {
    const key = fieldKey(truth.field).replace("amount", "").replace("draft", "");
    const hit = events.find(
      (e) => e.kind === "field_changed" && fieldKey(`${e.field ?? ""}${e.object}`).includes(key),
    );
    // The DOM logs an emptied field as null; the screen shows it empty.
    const exact =
      !!hit &&
      (truth.field === "reply_draft"
        ? norm(hit.to).length > 0
        : norm(hit.from) === norm(truth.from) && norm(hit.to) === norm(truth.to));
    return {
      kind: truth.type,
      detected: !!hit,
      exact,
      detail: hit ? `${hit.field ?? hit.object}: ${hit.from ?? "∅"} → ${hit.to ?? "∅"}` : "-",
    };
  }
  const hit = events.find(
    (e) =>
      e.kind === "action" &&
      outcomeFromText([e.object, e.field, e.to, e.fact].filter(Boolean).join(" ")) ===
        truth.outcome,
  );
  const exact = !!hit && visionTicket(hit) === truth.ticketId;
  return {
    kind: truth.type,
    detected: !!hit,
    exact,
    detail: hit ? `${hit.object} → ${hit.to ?? hit.fact ?? ""}` : "-",
  };
}

interface Row {
  step: string;
  truth: Truth[];
  vision: VisionEvent[];
  scores: Score[];
  spurious: number;
  ms: number;
}

const rows: Row[] = [];
const recent: ScreenEvent[] = [];
let seen = 0;
let prev = await capture();
for (const step of STEPS) {
  await step.run();
  await page.waitForTimeout(300);
  const cur = await capture();
  const all = await domEvents();
  const truth = all.slice(seen);
  seen = all.length;
  const t0 = Date.now();
  const result = await extractEvents(llm, prev, cur, recent);
  const ms = Date.now() - t0;
  const scores = truth.map((t) => score(t, result.events));
  const structural = result.events.filter((e) => e.kind !== "visible_fact");
  const spurious = Math.max(0, structural.length - scores.filter((s) => s.detected).length);
  rows.push({ step: step.name, truth, vision: result.events, scores, spurious, ms });
  for (const e of result.events) {
    recent.push({
      id: `ev_${recent.length + 1}`,
      tMs: cur.tMs,
      frameId: cur.frameId,
      source: "vision",
      summary: [e.kind, e.object, e.field, e.from, e.to, e.fact].filter(Boolean).join(" · "),
      payload: {},
    });
  }
  const mark = scores.length === 0 ? "·" : scores.every((s) => s.exact) ? "✓" : "✗";
  say(
    `${mark} ${step.name.padEnd(28)} ${String(ms).padStart(6)} ms  ${
      result.unreadable ? "UNREADABLE " : ""
    }${scores.map((s) => `${s.kind}=${s.exact ? "ok" : s.detected ? "partial" : "missed"} [${s.detail}]`).join("; ")}`,
  );
  prev = cur;
}
await browser.close();

const kinds: Truth["type"][] = ["ticket_opened", "field_changed", "action_committed"];
const table = kinds.map((k) => {
  const s = rows.flatMap((r) => r.scores).filter((x) => x.kind === k);
  return {
    kind: k,
    total: s.length,
    detected: s.filter((x) => x.detected).length,
    exact: s.filter((x) => x.exact).length,
  };
});
const total = table.reduce((a, r) => a + r.total, 0);
const exact = table.reduce((a, r) => a + r.exact, 0);
const spurious = rows.reduce((a, r) => a + r.spurious, 0);
const latencies = rows.map((r) => r.ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;

say(`\nmodel ${env.SHADOW_MODEL}, ${rows.length} frame pairs, p50 ${p50} ms`);
say("| DOM event | total | detected | exact |");
say("| --- | ---: | ---: | ---: |");
for (const r of table) say(`| ${r.kind} | ${r.total} | ${r.detected} | ${r.exact} |`);
say(`| **all** | ${total} | - | ${exact} (${Math.round((exact / total) * 100)} %) |`);
say(
  `extra structural events (visible, but not in the DOM log, e.g. status Open → Solved): ${spurious}`,
);

const outDir = join(root, "eval/out");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `vision-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify({ model: env.SHADOW_MODEL, table, spurious, rows }, null, 2));
say(`wrote ${file}`);
process.exit(exact / total >= 0.8 ? 0 : 1);
