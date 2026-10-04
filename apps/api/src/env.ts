import { z } from "zod";

/** Single place that reads process.env. Fails fast at boot with a readable message. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  /** One or more allowed browser origins, comma-separated. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  ANTHROPIC_API_KEY: z.string().optional(),
  SHADOW_MODEL: z.string().default("claude-opus-5-5"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_INTERVIEWER_AGENT_ID: z.string().optional(),
  ELEVENLABS_TUTOR_AGENT_ID: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  PRESIDIO_ANALYZER_URL: z.string().url().optional(),
  PRESIDIO_ANONYMIZER_URL: z.string().url().optional(),
  /** Load seed/reference-guardrails.json when no Work Map is published. Never on in a judged run. */
  /**
   * How long /guard/presave and /copilot/run wait for the LLM judge before a machine ALLOW
   * becomes timeout_allow (§6.8 says 2.5 s; measured live, the judge takes ~2.7 s at p50).
   */
  GUARD_JUDGE_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  /**
   * Optional directory with workmap.json and recordings/<sessionId>.webm, restored at boot when
   * nothing is published. Unset: seed/boot; empty: off (see docs/DEPLOY_SPACE.md).
   */
  SHADOW_BOOT_DIR: z.string().optional(),
  DEMO_FALLBACK_RULES: z.enum(["0", "1"]).default("0"),
  /** Serve fixture data from seed/fixtures instead of calling Claude/Presidio (UI work, tests). */
  MOCK_AI: z.enum(["0", "1"]).default("0"),
  /**
   * Capture's screen signal. "vision": frames only (any app); DeskSim DOM events only score the
   * vision/DOM agreement metric. "vision+desk": DOM events also drive questions and the map.
   */
  CAPTURE_SIGNALS: z.enum(["vision", "vision+desk"]).default("vision"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().default("shadow-frames"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  PRESIDIO_IMAGE_REDACTOR_URL: z.string().url().optional(),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
