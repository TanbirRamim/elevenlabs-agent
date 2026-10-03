import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Route } from "@shadow/prompts";
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
 * The only way Shadow calls Claude: one route, one Zod schema, validated output or a typed error.
 * Callers must handle LlmError explicitly; nothing downstream ever sees unvalidated model text.
 */
export async function structured<S extends z.ZodType>(
  { client, model }: LlmDeps,
  route: Route,
  schema: S,
  content: Anthropic.Beta.BetaContentBlockParam[],
): Promise<z.infer<S>> {
  const res = await client.beta.messages.parse({
    model,
    max_tokens: route.maxTokens,
    system: route.system,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: route.effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new LlmError("refusal", route.version);
  if (res.stop_reason === "max_tokens") throw new LlmError("max_tokens", route.version);
  if (res.parsed_output == null) throw new LlmError("unparseable", route.version);
  return res.parsed_output as z.infer<S>;
}
