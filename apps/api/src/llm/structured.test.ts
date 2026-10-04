import { guardJudge, workMapBuilder } from "@shadow/prompts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type LlmDeps, structured } from "./structured.js";

/** A fake client that records the request options of each parse call. */
function fakeLlm() {
  const calls: { timeout?: number }[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (_params: unknown, options?: { timeout?: number }) => {
          calls.push(options ?? {});
          return { stop_reason: "end_turn", parsed_output: { ok: true } };
        },
      },
    },
  };
  return { llm: { client, model: "test" } as unknown as LlmDeps, calls };
}

const Ok = z.object({ ok: z.boolean() });
const text = [{ type: "text" as const, text: "x" }];

describe("structured request timeout", () => {
  it("gives the high-effort Work Map route longer than the client's 60 s default", async () => {
    // Measured live: one workmap@1 call takes 45-65 s; at 60 s it times out and retries.
    const { llm, calls } = fakeLlm();
    await structured(llm, workMapBuilder, Ok, text);
    expect(calls[0]?.timeout).toBeGreaterThanOrEqual(180_000);
  });

  it("keeps low-effort routes on a short timeout", async () => {
    const { llm, calls } = fakeLlm();
    await structured(llm, guardJudge, Ok, text);
    expect(calls[0]?.timeout).toBeLessThanOrEqual(60_000);
  });
});
