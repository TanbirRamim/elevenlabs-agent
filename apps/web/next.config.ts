import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@shadow/schema", "@shadow/guard"],
  // Screen capture needs a secure context; localhost counts. Deployed builds are HTTPS only.
  poweredByHeader: false,
};

export default config;

// Lets `next dev` read Cloudflare bindings the same way the deployed Worker does.
initOpenNextCloudflareForDev();
