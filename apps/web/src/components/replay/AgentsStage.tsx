import Link from "next/link";
import { ACTION_LABELS } from "../desk/ActionBar";
import { ButtonLink } from "../ui/Button";
import { sampleWorkMap } from "../workmap/fixture";

/** Chapter 4: the same Work Map, read as a policy an agent follows. */
export function AgentsStage() {
  const rules = sampleWorkMap.guardrails.filter((g) => g.machineRule);
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-6">
        <h3 className="max-w-[14ch] font-display text-[2.75rem] leading-[1.02] font-normal tracking-[-0.025em] text-balance text-ink sm:text-[4rem]">
          People first, then agents.
        </h3>
        <p className="mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          The Work Map that taught Jonas is also a policy an AI agent can follow: the same steps,
          the same stops, and every judgment call handed back to a person. Each rule still carries
          the sentence Maya said it in.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/capture" size="lg">
            Start a capture session
          </ButtonLink>
          <ButtonLink href="/map/latest?fixture=1" size="lg" variant="secondary">
            Open the sample Work Map
          </ButtonLink>
        </div>
        <Link
          href="/copilot"
          className="mt-5 inline-flex min-h-11 items-center text-[0.9375rem] underline decoration-rule-strong underline-offset-[6px] hover:decoration-ink"
        >
          See the map as an agent policy
        </Link>
      </div>

      <section aria-labelledby="policy-title" className="lg:col-span-6">
        <h4 id="policy-title" className="text-sm font-medium text-ink-muted">
          The guardrails, as an agent reads them
        </h4>
        <ol className="mt-3 divide-y divide-rule border-y border-rule">
          {rules.map((g) => {
            const r = g.machineRule;
            if (!r) return null;
            return (
              <li key={g.id} className="grid grid-cols-[2.5rem_1fr] gap-3 py-3">
                <span className="font-mono text-xs text-ink-faint">{g.id}</span>
                <div className="min-w-0">
                  <p className="text-[0.9375rem] leading-snug text-ink">
                    {g.condition.charAt(0).toUpperCase() + g.condition.slice(1)}
                  </p>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-ink-muted">
                    {r.effect.toLowerCase().replace("_", " ")}
                    {r.expectedOutcome ? `, route to ${ACTION_LABELS[r.expectedOutcome]}` : ""}
                  </p>
                  <p className="mt-1.5 font-display text-[1.0625rem] leading-snug text-ink-muted italic">
                    “{g.evidence.quote.text}”
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
