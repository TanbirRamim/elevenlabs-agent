import type { WorkMap } from "@shadow/schema";
import { PredictionVariants } from "@shadow/schema";
import type { z } from "zod";

type Variants = z.infer<typeof PredictionVariants>;

/**
 * Two "what would the expert do?" variants, derived deterministically from the
 * map's machine-ruled guardrails (no LLM: descriptions come from evidenced
 * conditions, so they cannot drift from the map).
 */
export function predictionVariants(map: WorkMap): Variants {
  const stepByGuardrail = new Map<string, string>();
  for (const step of map.steps) {
    for (const id of step.guardrailIds) {
      if (!stepByGuardrail.has(id)) stepByGuardrail.set(id, step.id);
    }
  }
  const candidates = map.guardrails.flatMap((g) => {
    const becauseStepId = stepByGuardrail.get(g.id);
    const predictedOutcome = g.machineRule?.expectedOutcome;
    if (!becauseStepId || !predictedOutcome) return [];
    return [
      {
        id: `pv_${g.id}`,
        description: `A new ticket arrives where ${g.condition}. What does the expert do?`,
        predictedOutcome,
        becauseStepId,
      },
    ];
  });
  // Prefer two distinct outcomes so the learner cannot pattern-match one answer.
  const seen = new Set<string>();
  const variants = candidates
    .filter((v) => {
      if (seen.has(v.predictedOutcome)) return false;
      seen.add(v.predictedOutcome);
      return true;
    })
    .slice(0, 2);
  return PredictionVariants.parse({
    variants: variants.length > 0 ? variants : candidates.slice(0, 2),
  });
}
