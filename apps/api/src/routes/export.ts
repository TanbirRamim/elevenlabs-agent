import { rulesFromWorkMap } from "@shadow/guard";
import {
  AgentExport,
  CopilotRun,
  CopilotRunRequest,
  type CopilotTicketResult,
  type Outcome,
  type Ticket,
  type WorkMap,
} from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CLAUDE_ROUTE_RATE_LIMIT } from "../limits.js";
import { type JudgeDeps, runGuard } from "../llm/judge.js";
import type { LlmDeps } from "../llm/structured.js";
import type { Store } from "../store/memory.js";

/**
 * Triage Copilot export (HAR-15): the Work Map that taught the new hire, run as an agent policy.
 *
 * GET  /workmaps/:id/export?format=agent -> AgentExport { systemPrompt, rules }
 * POST /copilot/run { workMapId }        -> CopilotRun over the held-out seed tickets, shadow mode
 *
 * The Copilot runs the same check as /guard/presave (`runGuard`: the map's machine rules, then the
 * LLM judge when a key is configured), so `judge` in the response says whether a model looked.
 */

const OUTCOME_TEXT: Record<Outcome, string> = {
  reply: "reply",
  refund: "refund",
  hold_request_info: "hold and ask the customer for information",
  escalate_tier2: "escalate to Tier 2",
  escalate_engineering: "escalate to Engineering",
  handoff_security: "hand off to Security",
  handoff_legal: "hand off to Legal",
  handoff_billing_disputes: "hand off to Billing disputes",
  close: "close",
};

/**
 * The Copilot's starting point before the Work Map is applied, the same naive action the guard
 * eval uses: refund when the ticket names an amount, otherwise reply. Rules then overrule it.
 */
export const COPILOT_POLICY =
  "Start from the default action (refund when the ticket names an amount, otherwise reply), then apply the Work Map's machine rules; a rule's route replaces the default, and blocks, approvals, stop-and-ask rules and judgment calls go to a human.";

function defaultProposal(ticket: Pick<Ticket, "amountEur">): Outcome {
  return ticket.amountEur !== undefined ? "refund" : "reply";
}

export function buildAgentExport(map: WorkMap): AgentExport {
  const byId = new Map(map.guardrails.map((g) => [g.id, g]));
  const steps = [...map.steps].sort((a, b) => a.order - b.order);
  const expert = map.expertName;

  const stepLines = steps.map((s, i) => {
    const parts = [
      `${i + 1}. ${s.title}. ${s.decision}.`,
      `${expert}'s reason: "${s.reason.text}"`,
    ];
    if (s.guardrailIds.length > 0) parts.push(`Guardrails: ${s.guardrailIds.join(", ")}.`);
    if (s.judgmentCall) parts.push("This is a judgment call: hand it to a human.");
    return parts.join(" ");
  });

  const ruleLines = map.guardrails.map(
    (g) => `- [${g.id}, ${g.type.replace(/_/g, " ")}] When ${g.condition}: ${g.action}.`,
  );

  const stopLines: string[] = [];
  for (const g of map.guardrails) {
    if (g.type === "stop_and_ask") stopLines.push(`- ${g.condition} (${g.id})`);
    else if (g.machineRule?.effect === "REQUIRE_APPROVAL")
      stopLines.push(`- ${g.condition}: ${g.action} (${g.id})`);
    else if (g.machineRule?.effect === "BLOCK" && !g.machineRule.expectedOutcome)
      stopLines.push(`- ${g.condition}, and no route is named (${g.id})`);
  }
  for (const s of steps) {
    if (s.judgmentCall) {
      const ids = s.guardrailIds.filter((id) => byId.has(id));
      stopLines.push(
        `- the judgment call "${s.title}" applies${ids.length ? ` (${ids.join(", ")})` : ""}`,
      );
    }
  }
  stopLines.push("- no step or rule covers the ticket, or you are not sure which one does");

  const outcomes = (Object.keys(OUTCOME_TEXT) as Outcome[])
    .map((o) => (OUTCOME_TEXT[o] === o ? o : `${o} (${OUTCOME_TEXT[o]})`))
    .join(", ");

  const systemPrompt = [
    `You are the triage copilot for "${map.workflow}". You apply the Work Map that ${expert} taught (map ${map.id}, version ${map.version}). You work in shadow mode: for each ticket you propose one outcome and cite the guardrail ids you relied on, and a human confirms before anything is sent.`,
    `Allowed outcomes: ${outcomes}.`,
    `Steps, in the order ${expert} works them:\n${stepLines.join("\n")}`,
    ruleLines.length > 0
      ? `Hard rules. They override every step and you never break them:\n${ruleLines.join("\n")}`
      : "Hard rules: none were captured. Treat every ticket that is not a plain question as a judgment call.",
    `Stop and hand to a human when:\n${stopLines.join("\n")}`,
    "Answer with the outcome, the guardrail ids you cited, and whether a human must take over.",
  ].join("\n\n");

  return AgentExport.parse({
    workMapId: map.id,
    version: map.version,
    workflow: map.workflow,
    expertName: map.expertName,
    systemPrompt,
    rules: {
      machine: rulesFromWorkMap(map),
      guardrails: map.guardrails.map((g) => ({
        id: g.id,
        type: g.type,
        condition: g.condition,
        action: g.action,
        quote: g.evidence.quote.text,
        ...(g.machineRule ? { machineRule: g.machineRule } : {}),
      })),
    },
  });
}

type HandoffReason = NonNullable<CopilotTicketResult["handoffReason"]>;

export interface CopilotDeps {
  /** null: no key, machine rules only. */
  llm: LlmDeps | null;
  judge?: JudgeDeps;
}

/** Runs the pre-save guard over every held-out labelled ticket with the map's guardrails. */
export async function runCopilot(
  map: WorkMap,
  tickets: readonly Ticket[],
  { llm, judge }: CopilotDeps,
): Promise<CopilotRun> {
  const byId = new Map(map.guardrails.map((g) => [g.id, g]));
  const judgmentGuardrails = new Set(
    map.steps.filter((s) => s.judgmentCall).flatMap((s) => s.guardrailIds),
  );

  const heldOut = tickets.flatMap((t) =>
    t.label?.set === "held_out" ? [{ t, label: t.label }] : [],
  );
  const results = await Promise.all(
    heldOut.map(async ({ t, label }): Promise<CopilotTicketResult> => {
      const { label: _label, ...ticket } = t;
      const proposed = defaultProposal(ticket);
      const verdict = await runGuard(
        {
          ticket,
          outcome: proposed,
          ...(ticket.amountEur !== undefined ? { amountEur: ticket.amountEur } : {}),
        },
        { map, fallbackRules: [], llm, ...(judge ? { judge } : {}) },
      );
      const decision: Outcome | null =
        verdict.decision === "ALLOW" || verdict.decision === "REQUIRE_APPROVAL"
          ? (verdict.expectedOutcome ?? proposed)
          : (verdict.expectedOutcome ?? (verdict.decision === "WARN" ? proposed : null));
      const cited = verdict.ruleIds;
      let handoffReason: HandoffReason | null = null;
      if (cited.some((id) => byId.get(id)?.type === "stop_and_ask")) handoffReason = "stop_and_ask";
      else if (cited.some((id) => judgmentGuardrails.has(id))) handoffReason = "judgment_call";
      else if (verdict.decision === "REQUIRE_APPROVAL") handoffReason = "approval_required";
      else if (verdict.decision === "BLOCK") handoffReason = "blocked";
      // Safety policy: a refund is irreversible money, so with no rule clearing it a person decides.
      else if (decision === "refund" && cited.length === 0) handoffReason = "no_rule_refund";
      return {
        ticketId: t.id,
        subject: t.subject,
        proposed,
        decision,
        verdict: verdict.decision,
        source: verdict.source,
        citedGuardrailIds: cited,
        expected: label.outcome,
        expectedGuardrailIds: label.guardrails,
        agrees: decision === label.outcome,
        handedToHuman: handoffReason !== null,
        handoffReason,
      };
    }),
  );

  const agreed = results.filter((r) => r.agrees).length;
  const unsafe = (outcome: Outcome | null, r: CopilotTicketResult) =>
    outcome !== r.expected && r.expectedGuardrailIds.length > 0;
  const baselineAgreed = results.filter((r) => r.proposed === r.expected).length;
  return CopilotRun.parse({
    workMapId: map.id,
    version: map.version,
    workflow: map.workflow,
    expertName: map.expertName,
    judge: llm && map.guardrails.length > 0 ? "on" : "unavailable",
    policy: COPILOT_POLICY,
    tickets: results,
    agreement: {
      agreed,
      total: results.length,
      rate: results.length === 0 ? null : agreed / results.length,
    },
    handedToHuman: results.filter((r) => r.handedToHuman).length,
    unsafeAutoActions: results.filter((r) => !r.handedToHuman && unsafe(r.decision, r)).length,
    // Without the map nothing is handed off: the default action is sent on every ticket.
    baseline: {
      agreement: {
        agreed: baselineAgreed,
        total: results.length,
        rate: results.length === 0 ? null : baselineAgreed / results.length,
      },
      unsafeAutoActions: results.filter((r) => unsafe(r.proposed, r)).length,
    },
  });
}

const ExportQuery = z.object({ format: z.literal("agent") });

export interface ExportRouteDeps extends CopilotDeps {
  tickets: readonly Ticket[];
  /** MOCK_AI only: the fixture map, answered for "published" while nothing is published. */
  publishedFallback?: WorkMap;
}

export function registerExportRoutes(
  app: FastifyInstance,
  store: Store,
  { tickets, publishedFallback, llm, judge }: ExportRouteDeps,
): void {
  // Same lookup as the Work Map routes (draft, then published), plus the "published" alias.
  const findMap = (id: string): WorkMap | undefined => {
    const published = store.getPublishedWorkMap() ?? publishedFallback;
    if (id === "published") return published;
    return store.getWorkMap(id) ?? (published?.id === id ? published : undefined);
  };

  app.get<{ Params: { id: string } }>("/workmaps/:id/export", async (req, reply) => {
    const query = ExportQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ code: "unsupported_format", message: "use ?format=agent" });
    }
    const map = findMap(req.params.id);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    return buildAgentExport(map);
  });

  // Up to ten judge calls when a key is set, so it carries the Claude-route limit.
  app.post("/copilot/run", { config: CLAUDE_ROUTE_RATE_LIMIT }, async (req, reply) => {
    const body = CopilotRunRequest.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ code: "invalid_body", issues: body.error.issues });
    }
    const map = findMap(body.data.workMapId);
    if (!map) return reply.code(404).send({ code: "unknown_workmap" });
    const run = await runCopilot(map, tickets, { llm, judge: { log: req.log, ...judge } });
    req.log.info(
      { workMapId: run.workMapId, agreed: run.agreement.agreed, total: run.agreement.total },
      "copilot run",
    );
    return run;
  });
}
