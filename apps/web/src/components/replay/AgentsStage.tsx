import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ACTION_LABELS } from "../desk/ActionBar";
import { Badge } from "../ui/Badge";
import { ButtonLink } from "../ui/Button";
import { Panel } from "../ui/Card";
import { sampleWorkMap } from "../workmap/fixture";
import { GuardrailTypeBadge } from "../workmap/primitives";

const EFFECT_LABEL = { BLOCK: "Block", REQUIRE_APPROVAL: "Needs approval", WARN: "Warn" } as const;

/** Chapter 4: the same Work Map, read as a policy an agent follows. */
export function AgentsStage() {
  const rules = sampleWorkMap.guardrails.filter((g) => g.machineRule);
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="flex flex-col gap-4 rounded-panel border border-rule bg-surface p-4 sm:p-6 lg:col-span-5">
        <Badge tone="muted" className="self-start">
          The moonshot
        </Badge>
        <h3 className="text-xl leading-7 font-semibold tracking-[-0.01em] text-balance text-ink">
          People first, then agents.
        </h3>
        <p className="max-w-prose text-ui text-pretty text-ink-muted">
          The Work Map that taught Jonas is also a policy an AI agent can follow: the same steps,
          the same stops, and every judgment call handed back to a person. Each rule still carries
          the sentence Maya said it in.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/capture" size="md">
            Start a capture session
          </ButtonLink>
          <ButtonLink href="/map/latest?fixture=1" size="md" variant="secondary">
            Open the sample Work Map
          </ButtonLink>
        </div>
        <Link
          href="/copilot"
          className="inline-flex items-center gap-1 self-start text-ui font-medium text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
        >
          See the map as an agent policy
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <Panel
        id="policy"
        className="lg:col-span-7"
        title="The guardrails, as an agent reads them"
        meta={<span className="figures">{rules.length} machine rules</span>}
        flush
      >
        <ol className="divide-y divide-rule">
          {rules.map((g) => {
            const r = g.machineRule;
            if (!r) return null;
            return (
              <li key={g.id} className="grid grid-cols-[2rem_1fr] gap-3 px-4 py-3">
                <span className="figures pt-0.5 font-mono text-xs text-ink-faint">{g.id}</span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <GuardrailTypeBadge type={g.type} />
                    <span className="text-ui font-medium text-ink">
                      {g.condition.charAt(0).toUpperCase() + g.condition.slice(1)}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    {EFFECT_LABEL[r.effect]}
                    {r.expectedOutcome ? ` → ${ACTION_LABELS[r.expectedOutcome]}` : ""}
                  </p>
                  <blockquote className="border-l-2 border-rule-strong pl-3 text-ui text-ink-muted">
                    “{g.evidence.quote.text}”
                  </blockquote>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}
