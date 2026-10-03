import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR or data cache in this app, so no incremental-cache override is needed.
export default defineCloudflareConfig({});
