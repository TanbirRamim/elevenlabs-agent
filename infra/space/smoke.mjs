// Smoke test for a running Space (or the image locally). Node 22+, no dependencies.
//
//   node infra/space/smoke.mjs https://<user>-<space>.hf.space
//   node infra/space/smoke.mjs http://localhost:7861
//
// Checks: GET /health, GET /tickets, POST /sessions, then the session WebSocket
// (/sessions/:id/stream): hello -> ready, and a transcript segment accepted without error.
const base = (process.argv[2] ?? "http://localhost:7861").replace(/\/$/, "");
const log = (msg) => process.stdout.write(`${msg}\n`);
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exit(1);
};
const t0 = Date.now();

const health = await fetch(`${base}/health`).catch((e) => fail(`/health unreachable: ${e}`));
if (!health.ok) fail(`/health -> ${health.status}`);
log(`ok   /health ${health.status} ${JSON.stringify(await health.json())} (${Date.now() - t0} ms)`);

const tickets = await fetch(`${base}/tickets?set=expert`);
if (!tickets.ok) fail(`/tickets -> ${tickets.status}`);
log(`ok   /tickets ${tickets.status} (${(await tickets.json()).tickets.length} seed tickets)`);

const created = await fetch(`${base}/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode: "capture" }),
});
if (created.status !== 201) fail(`POST /sessions -> ${created.status}`);
const { id } = await created.json();
log(`ok   POST /sessions 201 id=${id}`);

const wsUrl = `${base.replace(/^http/, "ws")}/sessions/${id}/stream`;
await new Promise((resolve) => {
  const ws = new WebSocket(wsUrl);
  const timer = setTimeout(() => fail(`no "ready" from ${wsUrl} within 10 s`), 10_000);
  ws.onerror = () => fail(`WebSocket error on ${wsUrl}`);
  ws.onopen = () => {
    log(`ok   WebSocket open ${wsUrl}`);
    ws.send(JSON.stringify({ type: "hello", protocol: 1, sessionId: id }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.type === "error") fail(`server error ${msg.code}: ${msg.message}`);
    if (msg.type !== "ready") return;
    log(`ok   ready protocol=${msg.protocol}`);
    // Fake PII: Presidio should store this redacted (or as "[redaction unavailable]").
    ws.send(
      JSON.stringify({
        type: "transcript",
        segmentId: "smoke_1",
        tStartMs: 0,
        tEndMs: 1500,
        speaker: "expert",
        text: "Email Jane Doe at jane.doe@example.com or call 212-555-0187 about the refund.",
      }),
    );
    // Any error reply would arrive well within this window.
    setTimeout(() => {
      clearTimeout(timer);
      log("ok   transcript accepted");
      ws.close();
      resolve();
    }, 1500);
  };
});
log(`PASS ${base} session=${id} (${Date.now() - t0} ms)`);
