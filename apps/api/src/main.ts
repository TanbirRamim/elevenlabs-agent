import { join } from "node:path";
import { findSeedDir, loadReferenceRules } from "@shadow/guard/fixtures";
import { buildApp } from "./app.js";
import { restoreBootState } from "./boot.js";
import { loadEnv } from "./env.js";
import { createDiskStorage } from "./storage/disk.js";
import { createS3Storage } from "./storage/s3.js";
import { createJsonlStore } from "./store/jsonl.js";
import { createMemoryStore } from "./store/memory.js";

const env = loadEnv();
const dataDir = join(findSeedDir(), "..", "infra", "data");
// Sessions and maps survive an API restart: JSONL on local disk, mirrored to
// R2/RustFS when S3 is configured (in prod the container disk is wiped on stop).
const s3 = await createS3Storage(env);
// Fixture mode (tests, UI work) keeps nothing between runs, so it never reads the live state.
const persistent =
  env.MOCK_AI === "1" ? null : await createJsonlStore({ dir: join(dataDir, "state"), storage: s3 });
const store = persistent ?? createMemoryStore();
// Without S3, recordings and frames go to the local disk: they last for this uptime.
const storage = s3 ?? createDiskStorage(join(dataDir, "objects"));
const app = await buildApp({
  env,
  store,
  storage,
  fallbackRules: env.DEMO_FALLBACK_RULES === "1" ? loadReferenceRules() : [],
});
// After a wiped disk (Hugging Face Space restart), republish the committed demo map and clips.
// Unset: restore from seed/boot (the demo map). Empty string: no boot restore. Fixture mode
// serves its own sample data, so it never restores.
await restoreBootState({
  dir: env.MOCK_AI === "1" ? undefined : (env.SHADOW_BOOT_DIR ?? join(findSeedDir(), "boot")),
  store,
  storage,
  log: app.log,
});
await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    // Close the app first so in-flight requests and sockets finish mutating
    // sessions before the final flush.
    void app
      .close()
      .then(() => persistent?.close())
      .then(() => process.exit(0));
  });
}
