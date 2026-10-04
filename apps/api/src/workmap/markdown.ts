import type { WorkMap } from "@shadow/schema";

/**
 * Renders the published map for the Tutor's knowledge base: steps in order,
 * each with its reason quote and guardrails, and an explicit "ask a senior
 * colleague" rule for anything the map does not cover.
 */
export function workMapToMarkdown(map: WorkMap): string {
  const guardrailsById = new Map(map.guardrails.map((g) => [g.id, g]));
  const lines: string[] = [
    `# Work Map: ${map.workflow}`,
    "",
    `Learned from ${map.expertName}. Version ${map.version}, coverage ${Math.round(map.coverage * 100)}%.`,
    "",
    "## Steps",
  ];
  for (const step of [...map.steps].sort((a, b) => a.order - b.order)) {
    lines.push("", `### ${step.order}. ${step.title}`);
    lines.push(`- Decision: ${step.decision}${step.judgmentCall ? " (judgment call)" : ""}`);
    lines.push(`- ${map.expertName} said: "${step.reason.text}"`);
    for (const id of step.guardrailIds) {
      const g = guardrailsById.get(id);
      if (g) lines.push(`- Guardrail [${g.id}]: ${g.condition} -> ${g.action}`);
    }
  }
  lines.push("", "## Guardrails");
  for (const g of map.guardrails) {
    lines.push(
      `- [${g.id}] (${g.type}) When ${g.condition}: ${g.action}. Evidence: "${g.evidence.quote.text}"`,
    );
  }
  if (map.openQuestions.length > 0) {
    lines.push("", "## Not covered yet");
    for (const q of map.openQuestions) {
      lines.push(`- ${q.text}`);
    }
  }
  lines.push(
    "",
    "## When unsure",
    "For anything this map does not cover, do not guess: ask a senior colleague before acting.",
  );
  return `${lines.join("\n")}\n`;
}
