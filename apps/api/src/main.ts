import { loadReferenceRules } from "@shadow/guard/fixtures";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = await buildApp({
  env,
  fallbackRules: env.DEMO_FALLBACK_RULES === "1" ? loadReferenceRules() : [],
});
await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0));
  });
}
