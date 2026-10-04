#!/usr/bin/env node
/**
 * Real-pipeline smoke test: drives one realistic capture -> debrief -> Work Map -> publish ->
 * teach -> mastery -> Copilot run against a RUNNING API in real mode (MOCK_AI unset, a real
 * ANTHROPIC_API_KEY, Presidio and S3/RustFS up). It sends exactly what the web client sends
 * (apps/web/src/app/capture/CaptureSession.tsx, lib/stream.ts, teach/TeachSession.tsx):
 * desk events, transcript segments, redacted JPEG frames, off-record toggles.
 *
 *   node scripts/smoke-real.mjs [--api http://localhost:4141] [--debrief-max 8] [--pace 1]
 *
 * --pace scales the waits between desk events (1 = realistic, 0.3 = fast). The debrief answers
 * until the API says done (8 questions or 5 minutes), or --debrief-max answers.
 *
 * Frames are rendered with the Playwright Chromium that apps/web already installs (a static
 * DeskSim look-alike with the customer's name and email blacked out, like the client does).
 * Without Playwright no frames are sent, and the map cannot cite any moment (it will fail).
 *
 * Exit code 0 only when every check passes. Never prints secrets: it only talks to the API.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:4141" },
    "debrief-max": { type: "string", default: "8" },
    pace: { type: "string", default: "1" },
  },
});
const API = args.api.replace(/\/+$/, "");
const WS = API.replace(/^http/, "ws");
const DEBRIEF_MAX = Number(args["debrief-max"]);
const PACE = Number(args.pace);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const out = (line = "") => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * PACE));
const results = [];

function record(name, ok, ms, detail = "") {
  results.push({ name, ok, ms, detail });
  out(`${ok ? "PASS" : "FAIL"}  ${name}  ${ms === null ? "" : `${Math.round(ms)} ms`}  ${detail}`);
}

async function http(method, path, body, headers = {}) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const ms = performance.now() - started;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, ms };
}

/** Times one call and records it; a non-2xx is a FAIL with the error code. */
async function step(name, method, path, body, { headers, check } = {}) {
  const r = await http(method, path, body, headers);
  const okStatus = r.status >= 200 && r.status < 300;
  let detail = okStatus ? "" : `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
  let ok = okStatus;
  if (okStatus && check) {
    const verdict = check(r.json);
    ok = verdict.ok;
    detail = verdict.detail;
  }
  record(name, ok, r.ms, detail);
  return r;
}

const norm = (t) => t.toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------- frames

async function loadChromium() {
  try {
    const require = createRequire(join(ROOT, "apps/web/package.json"));
    const { chromium } = require("@playwright/test");
    return await chromium.launch();
  } catch (err) {
    out(`(no Playwright Chromium: ${String(err).slice(0, 120)}; frames are skipped)`);
    return null;
  }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function deskHtml(tickets, selected, status) {
  const list = tickets
    .map(
      (t) =>
        `<li class="${t.id === selected?.id ? "sel" : ""}"><b>${t.id}</b> ${esc(t.subject)}</li>`,
    )
    .join("");
  const detail = selected
    ? `<h2>${selected.id} · ${esc(selected.subject)}</h2>
       <p class="who"><span class="pii"></span> <span class="pii wide"></span> · plan ${selected.customer.plan} · account ${selected.customer.accountAgeDays} days${selected.customer.vip ? " · VIP" : ""}</p>
       <p class="body">${esc(selected.body)}</p>
       <p>${selected.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>
       ${selected.amountEur !== undefined ? `<p>Refund amount <input value="${selected.amountEur}"> EUR</p>` : ""}
       <p class="actions"><button>Reply</button><button>Refund</button><button>Hold, ask info</button><button>Escalate</button><button>Hand off</button><button>Close</button></p>
       <p class="status">${esc(status)}</p>`
    : "<p>Select a ticket</p>";
  return `<!doctype html><html><head><style>
    body{font:15px system-ui;margin:0;background:#fff;color:#111}
    header{padding:10px 16px;border-bottom:1px solid #ddd;font-weight:600}
    .grid{display:grid;grid-template-columns:300px 1fr}
    ul{list-style:none;margin:0;padding:0;border-right:1px solid #ddd;background:#f6f6f4;min-height:620px}
    li{padding:12px 14px;border-bottom:1px solid #e5e5e5} li.sel{background:#e8e6df}
    main{padding:16px 22px} .pii{display:inline-block;width:90px;height:14px;background:#000}
    .pii.wide{width:150px} .tag{border:1px solid #999;border-radius:10px;padding:2px 8px;font-size:13px}
    button{margin-right:6px;padding:6px 10px} .status{font-weight:600;color:#245}
  </style></head><body><header>Support inbox · ${tickets.length} tickets</header>
  <div class="grid"><ul>${list}</ul><main>${detail}</main></div></body></html>`;
}

function makeFrameRenderer(browser, tickets) {
  let seq = 0;
  return async (selectedId, status) => {
    if (!browser) return null;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.setContent(
        deskHtml(
          tickets,
          tickets.find((t) => t.id === selectedId),
          status,
        ),
      );
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70 });
      seq += 1;
      // The client's phash is a 64-bit dHash; any stable 16-hex string satisfies the contract.
      const phash = createHash("sha1").update(jpeg).digest("hex").slice(0, 16);
      return { frameId: `f${seq}-${phash}`, phash, jpegBase64: jpeg.toString("base64") };
    } finally {
      await page.close();
    }
  };
}

// ---------------------------------------------------------------------------- socket

function openStream(sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/sessions/${sessionId}/stream`);
    const inbox = { screen: [], vision: [], candidates: [], insights: [], errors: [] };
    const timer = setTimeout(() => reject(new Error("no ready within 5 s")), 5000);
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "ready") {
        clearTimeout(timer);
        resolve({ ws, inbox, send: (msg) => ws.send(JSON.stringify(msg)) });
      } else if (m.type === "screen_event") {
        inbox.screen.push(m.event);
        if (m.event.source === "vision") inbox.vision.push(m.event);
      } else if (m.type === "candidate_question") inbox.candidates.push(m.question);
      else if (m.type === "insight") inbox.insights.push(m);
      else if (m.type === "error") inbox.errors.push(m);
    };
    ws.onerror = () => reject(new Error("websocket error"));
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", protocol: 1, sessionId }));
  });
}

// ---------------------------------------------------------------------------- script

/** Maya's lines per ticket (seed/fixtures/workmap.json quotes come from these). */
const CAPTURE = {
  T1: {
    outcome: "reply",
    lines: [
      "Okay, T1. Ava can't find her September invoice.",
      "If the account looks normal I just resend the invoice, no need to involve anyone.",
    ],
    followUp:
      "Only if the invoice itself is wrong would I loop in billing, otherwise a reply is enough.",
  },
  T2: {
    outcome: "refund",
    lines: [
      "T2, charged twice this month, 49 euros each.",
      "Two identical charges on the same day is a clear duplicate, I refund the second one.",
      "It's under a hundred, so I can do it alone. Anything over a hundred euros I don't refund alone, a lead has to approve it.",
    ],
    followUp:
      "If the two charges are on different days I check it's not two seats before refunding.",
  },
  T3: {
    outcome: "handoff_billing_disputes",
    lines: [
      "T3 wants her 240 euros back for the annual plan, and she says she already told her bank. See the chargeback-open tag.",
      "Never refund with an open chargeback, we'd pay twice. That goes to Billing disputes.",
      "So I'm holding the refund and handing it to Billing disputes instead.",
    ],
    followUp:
      "The bank already pulls the money back in a chargeback, so a refund on top means we pay twice.",
  },
  T4: {
    outcome: "handoff_security",
    lines: [
      "T4. Dario says someone changed the email on his account and he didn't do it, and he wants 120 euros back.",
      "Someone changed my email is an account takeover flag, so no refund and straight to Security.",
      "And I don't confirm any account details to him until Security has checked.",
    ],
    followUp: "If whoever writes might not be the owner, anything I send could go to the attacker.",
  },
};

const FRAUD_LINE =
  'If a customer says their card was used "without my permission", that\'s fraud. Never refund that, it goes to Security first.';
const OFF_RECORD_LINE =
  "Honestly, between us, the disputes team takes forever and I hate this tool.";

function debriefAnswer(question) {
  const q = question.text.toLowerCase();
  if (/legal|lawyer|gdpr|delet/.test(q))
    return "Anything GDPR or delete-my-data goes straight to Legal, we never handle that ourselves. Same when they mention a lawyer: I stop replying and route it to Legal.";
  if (/engineering|bug/.test(q))
    return "If a known bug caused it, I don't refund it myself. It goes to Engineering with the bug number.";
  if (/chargeback|bank|dispute/.test(q)) return CAPTURE.T3.followUp;
  if (/security|takeover|email|hack|fraud/.test(q)) return CAPTURE.T4.followUp;
  if (/hundred|100|approv|limit|amount|lead/.test(q))
    return "Anything over a hundred euros I don't refund alone, a lead has to approve it.";
  if (/duplicate|twice|t2/.test(q)) return CAPTURE.T2.followUp;
  if (/invoice|t1/.test(q)) return CAPTURE.T1.followUp;
  return "I look at the tags and the amount first. If anything looks off I ask a lead before I act.";
}

async function main() {
  out(`Shadow real-pipeline smoke against ${API}`);
  const health = await http("GET", "/health");
  record("health", health.status === 200, health.ms, `model ${health.json?.model ?? "?"}`);
  if (health.status !== 200) return;

  const { json: ticketsJson } = await http("GET", "/tickets?set=expert");
  const tickets = ticketsJson.tickets;
  const { json: newHire } = await http("GET", "/tickets?set=new_hire");

  // ---- capture
  const created = await step("create capture session", "POST", "/sessions", { mode: "capture" });
  const sessionId = created.json.id;
  const stream = await openStream(sessionId);
  const browser = await loadChromium();
  const render = makeFrameRenderer(browser, tickets);
  const t0 = Date.now();
  const clock = () => Date.now() - t0;
  const sent = new Map(); // segmentId -> { text, speaker, offRecord }
  const frames = [];
  let seg = 0;

  const say = (text, speaker = "expert", offRecord = false) => {
    seg += 1;
    const id = `l${seg}`;
    const tMs = clock();
    stream.send({ type: "transcript", segmentId: id, tStartMs: tMs, tEndMs: tMs, speaker, text });
    sent.set(id, { text, speaker, offRecord });
    return id;
  };
  const frame = async (ticketId, status) => {
    const f = await render(ticketId, status);
    if (!f) return;
    stream.send({ type: "frame", tMs: clock(), ...f });
    frames.push(f.frameId);
  };
  const desk = (event) => stream.send({ type: "desk_event", event: { tMs: clock(), ...event } });

  const asked = [];
  const captureStarted = performance.now();
  await frame(null, "");
  for (const ticket of tickets) {
    const plan = CAPTURE[ticket.id];
    if (!plan) continue;
    desk({ type: "ticket_opened", ticketId: ticket.id });
    await frame(ticket.id, "");
    for (const line of plan.lines) {
      await sleep(2500);
      say(line);
    }
    desk({ type: "input_activity" });
    // Capture mode never blocks; the client still asks the guard before committing.
    const pending = {
      ticket,
      outcome: plan.outcome,
      ...(plan.outcome === "refund" && ticket.amountEur !== undefined
        ? { amountEur: ticket.amountEur }
        : {}),
    };
    await http("POST", "/guard/presave", pending);
    const { ticket: _ticket, ...committed } = pending;
    desk({ type: "action_committed", ticketId: ticket.id, ...committed });
    await frame(ticket.id, `Committed: ${plan.outcome.replaceAll("_", " ")}`);
    // Give the Curiosity Engine a pause to plan a question, then ask it (Turn Gate open).
    await sleep(4000);
    const q = stream.inbox.candidates.find(
      (c) => c.aboutTicketId === ticket.id && !asked.includes(c.id),
    );
    if (q) {
      asked.push(q.id);
      stream.send({ type: "question_asked", questionId: q.id, tMs: clock() });
      say(q.text, "agent");
      await sleep(2500);
      say(plan.followUp);
    }
    if (ticket.id === "T3") {
      // Off the record between T3 and T4. The real client sends nothing while off; the
      // segment below checks the server-side drop as well.
      stream.send({ type: "off_record", on: true, tMs: clock() });
      await sleep(1000);
      say(OFF_RECORD_LINE, "expert", true);
      await sleep(1000);
      stream.send({ type: "off_record", on: false, tMs: clock() });
    }
  }
  // OCR redaction + vision lag behind the last frame; the client uploads the recording here.
  await sleep(10_000);
  record(
    "capture stream",
    stream.inbox.errors.length === 0 && frames.length > 0,
    performance.now() - captureStarted,
    `${frames.length} frames, ${sent.size} segments, ${stream.inbox.vision.length} vision events, ${stream.inbox.candidates.length} candidate questions (${asked.length} asked), ws errors ${stream.inbox.errors.length}`,
  );
  const lastInsight = stream.inbox.insights.at(-1);
  if (lastInsight) {
    out(
      `      insight: vision p90 ${lastInsight.visionLatencyMsP90 ?? "n/a"} ms, unreadable ${lastInsight.visionUnreadableFrames}, dom/vision agreement ${lastInsight.domVisionAgreement ?? "n/a"}, open gaps ${lastInsight.openGaps}`,
    );
  }
  if (browser) await browser.close();

  // ---- debrief
  const end = await step(
    "end session (build draft map)",
    "POST",
    `/sessions/${sessionId}/end`,
    {},
    {
      check: (j) => ({
        ok: j.openQuestions.length > 0,
        detail: `coverage ${j.coverage}, ${j.openQuestions.length} open questions`,
      }),
    },
  );
  if (end.status !== 200) return finish(stream);
  const workMapId = end.json.workMapId;
  let open = end.json.openQuestions;
  let fraudSaid = false;
  for (let i = 0; i < DEBRIEF_MAX && open.length > 0; i++) {
    const q = [...open].sort((a, b) => b.priority - a.priority)[0];
    const ids = [say(debriefAnswer(q))];
    if (!fraudSaid) {
      await sleep(1500);
      ids.push(say(FRAUD_LINE));
      fraudSaid = true;
    }
    await sleep(1500); // let Presidio redact and store the segments first
    const r = await step(
      `debrief answer ${i + 1} (${q.id})`,
      "POST",
      `/sessions/${sessionId}/debrief/answer`,
      { questionId: q.id, segmentIds: ids },
      {
        check: (j) => ({
          ok: true,
          detail: `coverage ${j.coverage}, ${j.openQuestions.length} open, done ${j.done}`,
        }),
      },
    );
    if (r.status !== 200) break;
    open = r.json.openQuestions;
    if (r.json.done) break;
  }
  await step(
    "teach-back text",
    "POST",
    `/sessions/${sessionId}/teachback`,
    {},
    {
      check: (j) => ({ ok: j.text.length > 40, detail: `${j.text.length} chars` }),
    },
  );
  say("Yes, that's right.");
  await step("teach-back confirm", "POST", `/sessions/${sessionId}/teachback/confirm`, {
    tMs: clock(),
    confirmed: true,
    correctionSegmentIds: [],
  });
  stream.ws.close();

  // ---- verify the map against what was actually said and shown
  const { json: map, ms: mapMs } = await http("GET", `/workmaps/${workMapId}`);
  const expertText = new Map(
    [...sent].filter(([, s]) => s.speaker === "expert" && !s.offRecord).map(([id, s]) => [id, s]),
  );
  const problems = [];
  const quotes = [
    ...map.steps.map((s) => ({ where: s.id, quote: s.reason, moment: s.moment })),
    ...map.guardrails.map((g) => ({
      where: g.id,
      quote: g.evidence.quote,
      moment: g.evidence.moment,
    })),
  ];
  for (const { where, quote, moment } of quotes) {
    const said = expertText.get(quote.segmentId);
    if (!said)
      problems.push(`${where}: segment ${quote.segmentId} is not an on-record expert line`);
    else if (!norm(said.text).includes(norm(quote.text)) && !quote.text.includes("<"))
      problems.push(`${where}: quote not verbatim`);
    if (!frames.includes(moment.frameId))
      problems.push(`${where}: frame ${moment.frameId} never sent`);
  }
  const allText = JSON.stringify(map).toLowerCase();
  if (allText.includes("hate this tool")) problems.push("off-record line leaked into the map");
  const removed = map.openQuestions.filter((q) => q.id.startsWith("oq_removed_")).length;
  record(
    "map evidence verified",
    problems.length === 0 && map.steps.length > 0,
    mapMs,
    `${map.steps.length} steps, ${map.guardrails.length} guardrails (${map.guardrails.filter((g) => g.machineRule).length} machine rules), ${map.openQuestions.length} open questions (${removed} from failed evidence), coverage ${map.coverage}, teach-back ${map.teachBackConfirmedAtMs === null ? "unconfirmed" : "confirmed"}${problems.length ? `; ${problems.slice(0, 3).join("; ")}` : ""}`,
  );
  for (const g of map.guardrails) {
    out(
      `      ${g.id} [${g.type}] ${g.condition} -> ${g.action}${g.machineRule ? ` | rule ${JSON.stringify(g.machineRule.when)} ${g.machineRule.effect} ${g.machineRule.expectedOutcome ?? ""}` : " | no machine rule"}`,
    );
  }
  const fraud = map.guardrails.find((g) =>
    /without my permission|fraud/.test(`${g.condition} ${g.evidence.quote.text}`.toLowerCase()),
  );
  record("fraud guardrail captured", Boolean(fraud), null, fraud ? fraud.id : "missing");

  await step("publish", "POST", `/workmaps/${workMapId}/publish`, {});
  await step("agent export", "GET", `/workmaps/${workMapId}/export?format=agent`, undefined, {
    check: (j) => ({
      ok: j.systemPrompt.length > 200,
      detail: `${j.rules.machine.length} machine rules, prompt ${j.systemPrompt.length} chars`,
    }),
  });

  // ---- teach
  const teach = await step("create teach session", "POST", "/sessions", {
    mode: "teach",
    workMapId,
  });
  const teachId = teach.json.id;
  const ts = await openStream(teachId);
  const n1 = newHire.tickets.find((t) => t.id === "N1");
  ts.send({ type: "desk_event", event: { type: "ticket_opened", tMs: 1000, ticketId: "N1" } });
  await step(
    "presave refund N1 (teach)",
    "POST",
    "/guard/presave",
    { ticket: n1, outcome: "refund", amountEur: n1.amountEur },
    {
      headers: { "x-shadow-session": teachId },
      check: (v) => ({
        ok: v.decision === "BLOCK" && Boolean(fraud) && v.ruleIds.includes(fraud.id),
        detail: `${v.decision} via ${v.source}, rules [${v.ruleIds.join(", ")}], expected ${v.expectedOutcome ?? "-"}`,
      }),
    },
  );
  const n2 = newHire.tickets.find((t) => t.id === "N2");
  await step(
    "presave reply N2 (teach)",
    "POST",
    "/guard/presave",
    { ticket: n2, outcome: "reply" },
    {
      headers: { "x-shadow-session": teachId },
      check: (v) => ({
        ok: true,
        detail: `${v.decision} via ${v.source}, rules [${v.ruleIds.join(", ")}] (label: handoff_legal)`,
      }),
    },
  );
  ts.send({
    type: "desk_event",
    event: { type: "action_committed", tMs: 9000, ticketId: "N1", outcome: "handoff_security" },
  });
  await step(
    "prediction variants",
    "POST",
    `/workmaps/${workMapId}/predictions`,
    {},
    {
      check: (j) => ({
        ok: true,
        detail: j.variants.map((v) => `${v.id}->${v.predictedOutcome}`).join(", ") || "none",
      }),
    },
  );
  // The teach page asks for a prediction at the most severe content rule an opened ticket hits
  // (apps/web/src/components/tutor/logic.ts matchJudgment); the learner answers handoff_security.
  const rank = { BLOCK: 3, REQUIRE_APPROVAL: 2, WARN: 1 };
  const n1Text = `${n1.subject}\n${n1.body}`.toLowerCase();
  const hit = map.guardrails
    .filter(({ machineRule: r }) => {
      if (!r || (!r.when.anyTag?.length && !r.when.bodyMatchesAny?.length)) return false;
      if (r.when.anyTag?.length && !r.when.anyTag.some((t) => n1.tags.includes(t))) return false;
      return (
        !r.when.bodyMatchesAny?.length ||
        r.when.bodyMatchesAny.some((p) => n1Text.includes(p.toLowerCase()))
      );
    })
    .sort((a, b) => rank[b.machineRule.effect] - rank[a.machineRule.effect])[0];
  if (hit) {
    const predictId = map.steps.find((s) => s.guardrailIds.includes(hit.id))?.id ?? hit.id;
    await step(
      `learner prediction N1 (${predictId})`,
      "POST",
      `/sessions/${teachId}/predictions`,
      { ticketId: "N1", stepId: predictId, predictedOutcome: "handoff_security", tMs: 5000 },
      {
        check: (j) => ({
          ok: j.correct,
          detail: `correct ${j.correct}, expected ${j.expectedOutcome}`,
        }),
      },
    );
  } else {
    record("learner prediction N1", false, null, "no content rule matches N1, so no [PREDICT]");
  }
  await step("mastery", "GET", `/sessions/${teachId}/mastery`, undefined, {
    check: (j) => ({ ok: true, detail: JSON.stringify(j).slice(0, 200) }),
  });
  ts.ws.close();

  await step(
    "copilot run (held-out)",
    "POST",
    "/copilot/run",
    { workMapId },
    {
      check: (j) => ({
        ok: j.agreement.total > 0,
        detail: `judge ${j.judge}, agreement ${j.agreement.agreed}/${j.agreement.total}, handed to human ${j.handedToHuman}, timeouts ${j.tickets.filter((t) => t.source === "timeout_allow").length}`,
      }),
    },
  );
  return finish();
}

function finish(stream) {
  stream?.ws.close();
  const failed = results.filter((r) => !r.ok);
  out("");
  out("| step | result | latency | detail |");
  out("| --- | --- | --- | --- |");
  for (const r of results) {
    out(
      `| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.ms === null ? "" : `${(r.ms / 1000).toFixed(2)} s`} | ${r.detail.replaceAll("|", "/")} |`,
    );
  }
  out("");
  out(failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  record("smoke run", false, null, String(err?.stack ?? err).slice(0, 300));
  finish();
});
