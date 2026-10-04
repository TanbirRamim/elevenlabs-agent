// Runs the API stack on this machine and exposes it on a free public HTTPS URL.
//
//   pnpm api:public                       # API + Presidio/RustFS in Docker + Cloudflare quick tunnel
//   pnpm api:public --web https://x.app   # also allow that origin for CORS (comma-separate several)
//
// Needs: Docker running, .env filled in, and `cloudflared` on PATH
// (https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).
// The printed https://*.trycloudflare.com URL changes on every run: put it into NEXT_PUBLIC_API_URL
// and NEXT_PUBLIC_API_WS_URL (wss://...) on the web host and redeploy. WebSockets pass through.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const webArg = process.argv.indexOf("--web");
const webOrigins = webArg === -1 ? "" : (process.argv[webArg + 1] ?? "");

if (!existsSync(`${root}.env`)) {
  console.error("No .env at repo root. Copy .env.example and fill in the keys first.");
  process.exit(1);
}
if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).status !== 0) {
  console.error(
    "cloudflared is not installed. macOS: `brew install cloudflared`; others: see the link in this script.",
  );
  process.exit(1);
}
if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error("Docker is not running.");
  process.exit(1);
}

const children = [];
const run = (cmd, args, opts = {}) => {
  const child = spawn(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], ...opts });
  children.push(child);
  return child;
};
const stopAll = () => {
  for (const c of children) c.kill("SIGINT");
};
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

console.warn("1/3 starting Presidio, RustFS and Postgres (docker compose)…");
const infra = spawnSync("docker", ["compose", "-f", "infra/docker-compose.yml", "up", "-d"], {
  cwd: root,
  stdio: "inherit",
});
if (infra.status !== 0) process.exit(infra.status ?? 1);

console.warn("2/3 starting the API on :4000…");
const api = run("pnpm", ["--filter", "@shadow/api", "dev"], {
  env: {
    ...process.env,
    ...(webOrigins ? { WEB_ORIGIN: `http://localhost:3000,${webOrigins}` } : {}),
  },
});
api.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
api.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));

console.warn("3/3 opening the tunnel…");
const tunnel = run("cloudflared", ["tunnel", "--url", "http://localhost:4000", "--no-autoupdate"]);
let announced = false;
const watch = (chunk) => {
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !announced) {
    announced = true;
    console.warn(
      `\nPublic API URL: ${m[0]}\n  NEXT_PUBLIC_API_URL=${m[0]}\n  NEXT_PUBLIC_API_WS_URL=${m[0].replace("https://", "wss://")}\nKeep this window open. Ctrl-C stops everything.\n`,
    );
  }
};
tunnel.stdout.on("data", watch);
tunnel.stderr.on("data", watch);
tunnel.on("exit", (code) => {
  console.error(`tunnel exited (${code})`);
  stopAll();
  process.exit(code ?? 1);
});
