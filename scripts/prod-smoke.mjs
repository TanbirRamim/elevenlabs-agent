#!/usr/bin/env node
// Production smoke test: checks that a judge's experience works end to end from anywhere.
// Usage: pnpm smoke:prod   (env: SMOKE_WEB_URL, SMOKE_API_URL, SMOKE_SHOTS_DIR)
// SMOKE_API_URL defaults to the NEXT_PUBLIC_API_URL baked into the live web bundle.
// Exits 1 if any check fails. Never prints signed URLs or other secrets.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { SMOKE_WEB_URL, SMOKE_API_URL, SMOKE_SHOTS_DIR, GITHUB_STEP_SUMMARY } = process.env;
const out = (line = "") => process.stdout.write(`${line}\n`);

const require = createRequire(join(process.cwd(), "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const WEB = (SMOKE_WEB_URL ?? "https://shadow-web-meow-4acb.vercel.app").replace(/\/$/, "");
const SHOTS = SMOKE_SHOTS_DIR ?? "prodsmoke-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = (await fn()) ?? "";
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
  } catch (e) {
    results.push({
      name,
      ok: false,
      ms: Date.now() - t0,
      detail: String(e?.message ?? e).split("\n")[0],
    });
  }
}
const fetchT = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) });

async function discoverApiUrl() {
  if (SMOKE_API_URL) return SMOKE_API_URL.replace(/\/$/, "");
  const chunks = new Set();
  for (const p of ["/", "/teach", "/capture"]) {
    const html = await (await fetchT(WEB + p)).text();
    for (const m of html.matchAll(/\/_next\/static\/[^"\\]+?\.js/g)) chunks.add(m[0]);
  }
  for (const c of chunks) {
    const m = (await (await fetchT(WEB + c)).text()).match(/apiUrl:"([^"]+)"/);
    if (m) return m[1].replace(/\/$/, "");
  }
  throw new Error("apiUrl not found in web bundle");
}

let API = "";
await check("discover API url", async () => {
  API = await discoverApiUrl();
  return API;
});

// ---------- API-level checks ----------
await check("API /health", async () => {
  const t0 = Date.now();
  const r = await fetchT(`${API}/health`);
  const ms = Date.now() - t0;
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const b = await r.json();
  if (b.ok !== true) throw new Error(`body ok=${b.ok}`);
  if (ms > 3000) throw new Error(`slow: ${ms} ms`);
  return `${ms} ms`;
});

await check("CORS for web origin", async () => {
  const r = await fetchT(`${API}/sessions`, {
    method: "OPTIONS",
    headers: {
      Origin: WEB,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const acao = r.headers.get("access-control-allow-origin");
  if (acao !== WEB && acao !== "*") throw new Error(`preflight ${r.status}, allow-origin=${acao}`);
  return `preflight ${r.status}`;
});

await check("signed-url (/api/eleven/signed-url)", async () => {
  const out = [];
  for (const agent of ["interviewer", "tutor"]) {
    const r = await fetchT(`${WEB}/api/eleven/signed-url?agent=${agent}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${agent}: ${r.status} ${b.code ?? ""}`);
    if (typeof b.signedUrl !== "string" && typeof b.agentId !== "string")
      throw new Error(`${agent}: no signedUrl/agentId`);
    out.push(`${agent}:${b.signedUrl ? "signedUrl" : "agentId"}`);
  }
  return out.join(" ");
});

await check("WebSocket hello→ready", async () => {
  const r = await fetchT(`${API}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: WEB },
    body: JSON.stringify({ mode: "capture" }),
  });
  if (r.status !== 201) throw new Error(`POST /sessions ${r.status}`);
  const { id } = await r.json();
  const wsUrl = `${API.replace(/^http/, "ws")}/sessions/${encodeURIComponent(id)}/stream`;
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t0 = Date.now();
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("no ready within 10 s"));
    }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", protocol: 1, sessionId: id }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === "ready") {
        clearTimeout(timer);
        ws.close();
        resolve(`${Date.now() - t0} ms`);
      } else if (m.type === "error") {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`server error: ${m.code ?? JSON.stringify(m).slice(0, 80)}`));
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("ws error"));
    };
  });
});

// ---------- Browser checks ----------
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  permissions: ["microphone", "camera"],
  viewport: { width: 1440, height: 900 },
});

async function route(path, assert, { slug } = {}) {
  const name = `page ${path}`;
  await check(name, async () => {
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`);
    });
    page.on("pageerror", (e) => problems.push(`uncaught: ${String(e.message).slice(0, 160)}`));
    page.on("requestfailed", (req) => {
      const u = req.url();
      if (u.startsWith(API) || u.startsWith(`${WEB}/api/`))
        problems.push(
          `reqfailed: ${req.method()} ${u.replace(API, "API")} ${req.failure()?.errorText}`,
        );
    });
    page.on("response", async (res) => {
      const u = res.url();
      if (!(u.startsWith(API) || u.startsWith(`${WEB}/api/`)) || res.status() < 400) return;
      const body = await res.text().catch(() => "");
      if (res.status() === 404 && body.includes("nothing_published")) return;
      problems.push(
        `http ${res.status()}: ${res.request().method()} ${u.replace(API, "API").replace(WEB, "")} ${body.slice(0, 80)}`,
      );
    });
    const shot = join(
      SHOTS,
      `${slug ?? (path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root")}.png`,
    );
    try {
      const resp = await page.goto(WEB + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (resp?.status() !== 200) throw new Error(`HTTP ${resp?.status()}`);
      const detail = await assert(page);
      await page.waitForTimeout(500);
      if (problems.length) throw new Error(problems.slice(0, 3).join(" | "));
      await page.screenshot({ path: shot, fullPage: false });
      return detail;
    } catch (e) {
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      throw new Error(`${e.message} [shot ${shot}]`);
    } finally {
      await page.close();
    }
  });
}
const see = (page, text, timeout = 15000) =>
  page.getByText(text).first().waitFor({ state: "visible", timeout });

await route("/", async (page) => {
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 15000 });
  return (await page.locator("h1").first().innerText()).slice(0, 50);
});

await route("/demo", async (page) => {
  await see(page, /Act 1 of/);
  await page.waitForTimeout(1500);
  await page.keyboard.press("3"); // chapter hotkey (1-4): scrub to Act 3, Teach
  await see(page, /Act 3 of/, 10000);
  return "reached Act 3";
});

await route("/capture", async (page) => {
  await see(page, /Interviewer agent, (signed session ready|public agent id)/, 20000);
  await see(page, /Redaction on|blacked out in this browser/, 20000);
  const failed = await page.getByText(/Check again/).count();
  if (failed) throw new Error("preflight shows a failed check (Check again visible)");
  return "preflight ready";
});

await route("/teach", async (page) => {
  await page.getByText("N1", { exact: true }).first().click({ timeout: 20000 });
  await page
    .getByRole("button", { name: /^Refund$/ })
    .first()
    .click({ timeout: 10000 });
  const t0 = Date.now();
  await see(page, "Paused by Shadow", 15000);
  await see(page, /G4/, 2000);
  const blockMs = Date.now() - t0;
  await page.getByText("N2", { exact: true }).first().click({ timeout: 10000 });
  await page
    .getByRole("region", { name: "Predict the decision" })
    .waitFor({ timeout: 15000 })
    .catch(() => {
      throw new Error(
        `blocked in ${blockMs} ms with G4, but N2 showed no "Predict the decision" panel`,
      );
    });
  return `block ${blockMs} ms; predict shown`;
});

for (const path of ["/map/latest", "/map/latest?fixture=1"]) {
  await route(path, async (page) => {
    await see(page, /Step|step/, 20000);
    const quotes = await page.locator("blockquote, q, [data-quote]").count();
    const text = await page.locator("main").innerText();
    const curly = (text.match(/[“"][^”"]{8,}[”"]/g) ?? []).length;
    if (quotes + curly === 0) throw new Error("no quotes visible");
    return `${quotes + curly} quotes`;
  });
}

await route("/copilot", async (page) => {
  await see(page, /Unsafe auto-actions/, 30000);
  return "safety stats visible";
});

await route("/voice-check", async (page) => {
  await page.locator("main").waitFor({ timeout: 15000 });
  return "loaded (signed URL verified via API check)";
});

await browser.close();

// ---------- Report ----------
const pad = (s, n) => String(s).padEnd(n);
out(`\nShadow production smoke — web ${WEB}\n`);
out(`${pad("RESULT", 7)}${pad("CHECK", 38)}${pad("TIME", 9)}DETAIL`);
for (const r of results)
  out(`${pad(r.ok ? "PASS" : "FAIL", 7)}${pad(r.name, 38)}${pad(`${r.ms}ms`, 9)}${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
out(`\n${results.length - failed}/${results.length} passed`);
if (GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    GITHUB_STEP_SUMMARY,
    `| Result | Check | Time | Detail |\n|---|---|---|---|\n${results
      .map(
        (r) =>
          `| ${r.ok ? "PASS" : "**FAIL**"} | ${r.name} | ${r.ms} ms | ${r.detail.replace(/\|/g, "\\|")} |`,
      )
      .join("\n")}\n`,
  );
}
process.exit(failed ? 1 : 0);
