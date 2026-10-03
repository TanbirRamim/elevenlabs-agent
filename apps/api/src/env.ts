import { z } from "zod";

/** Single place that reads process.env. Fails fast at boot with a readable message. */
const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
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
  DEMO_FALLBACK_RULES: z.enum(["0", "1"]).default("0"),
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
