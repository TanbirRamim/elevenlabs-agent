import { join } from "node:path";
import { findSeedDir, loadReferenceRules } from "@shadow/guard/fixtures";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createS3Storage } from "./storage/s3.js";
import { createJsonlStore } from "./store/jsonl.js";

const env = loadEnv();
// Sessions and maps survive an API restart: JSONL on local disk, mirrored to
// R2/RustFS when S3 is configured (in prod the container disk is wiped on stop).
const storage = await createS3Storage(env);
const store = createJsonlStore({
  dir: join(findSeedDir(), "..", "infra", "data", "state"),
  storage,
});
const app = await buildApp({
  env,
  store,
  storage,
  fallbackRules: env.DEMO_FALLBACK_RULES === "1" ? loadReferenceRules() : [],
});
await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void store
      .close()
      .then(() => app.close())
      .then(() => process.exit(0));
  });
}
