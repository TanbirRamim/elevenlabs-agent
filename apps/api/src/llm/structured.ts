import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Effort, Route } from "@shadow/prompts";
import type { z } from "zod";

export class LlmError extends Error {
  constructor(
    readonly code: "refusal" | "unparseable" | "max_tokens",
    readonly route: string,
  ) {
    super(`${route}: ${code}`);
  }
}

export interface LlmDeps {
  client: Anthropic;
  model: string;
}

export function createLlm(apiKey: string, model: string): LlmDeps {
  return { client: new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }), model };
}

/**
 * Per-request timeout by route effort. The high-effort Work Map builder writes up to 16k tokens
 * and was measured at 45-65 s per call live, so the client-wide 60 s made it time out and retry.
 */
const TIMEOUT_MS: Record<Effort, number> = { low: 60_000, medium: 60_000, high: 180_000 };

/**
 * The only way Shadow calls Claude: one route, one Zod schema, validated output or a typed error.
 * Callers must handle LlmError explicitly; nothing downstream ever sees unvalidated model text.
 */
export async function structured<S extends z.ZodType>(
  { client, model }: LlmDeps,
  route: Route,
  schema: S,
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<z.infer<S>> {
  const res = await client.beta.messages.parse(
    {
      model,
      max_tokens: route.maxTokens,
      system: route.system,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: route.effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content }],
    },
    { timeout: TIMEOUT_MS[route.effort] },
  );
  if (res.stop_reason === "refusal") throw new LlmError("refusal", route.version);
  if (res.stop_reason === "max_tokens") throw new LlmError("max_tokens", route.version);
  if (res.parsed_output == null) throw new LlmError("unparseable", route.version);
  return res.parsed_output as z.infer<S>;
}
