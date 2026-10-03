// Worker secrets, set in the Cloudflare dashboard (Settings → Variables and Secrets) or with
// `wrangler secret put <NAME>`. Typed here because wrangler.jsonc doesn't list them (see the comment
// there). On a fresh Worker they can be missing at runtime, so code reads them with a fallback.
interface Env {
  ANTHROPIC_API_KEY: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
}
