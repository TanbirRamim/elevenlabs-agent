"use client";

import { Plug } from "lucide-react";
import { useId, useState } from "react";
import { cx } from "@/components/ui/cx";
import type { ConnectorVerdict } from "@/lib/connector";

/**
 * The connector call made visible: "Shadow connector · check · BLOCK · 212 ms · G4", with the
 * exact request and response one click away. Prominent on a held save, subtle on an allowed one.
 */
export function ConnectorChip({
  verdict,
  subtle = false,
}: {
  verdict: ConnectorVerdict;
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const held = verdict.decision === "BLOCK";
  const where =
    verdict.via === "api" ? "check" : verdict.via === "browser" ? "in browser" : "no answer";
  const parts = [
    "Shadow connector",
    where,
    verdict.decision,
    `${verdict.latencyMs} ms`,
    ...(verdict.ruleIds.length ? [verdict.ruleIds.join(", ")] : []),
  ];

  return (
    <div className={cx("min-w-0", subtle ? "px-4 pb-3 @3xl:px-5" : "px-4 pt-3 @3xl:px-5")}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="connector-chip"
          className={cx(
            "figures inline-flex h-6 items-center gap-1.5 rounded-control border px-2 font-mono text-2xs",
            held
              ? "border-guard/40 bg-guard-wash text-guard-text"
              : subtle
                ? "border-rule bg-sunken text-ink-faint"
                : "border-rule bg-sunken text-ink-muted",
          )}
        >
          <Plug aria-hidden="true" className="size-3 stroke-[2]" />
          {parts.join(" · ")}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="text-2xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {open ? "Hide request" : "View request"}
        </button>
      </div>
      {open ? (
        <section
          id={panelId}
          className="mt-2 grid gap-2 text-2xs @3xl:grid-cols-2"
          aria-label="Connector request and response"
        >
          <JsonBlock label="Request" value={verdict.exchange.request} />
          <JsonBlock
            label={
              verdict.exchange.response.ok
                ? "Response"
                : `No response · decided ${verdict.via === "browser" ? "in the browser" : "fail-open"}`
            }
            value={
              verdict.exchange.response.ok
                ? verdict.exchange.response.body
                : {
                    error: verdict.exchange.response.error,
                    verdict: {
                      decision: verdict.decision,
                      ruleIds: verdict.ruleIds,
                      ...(verdict.expectedOutcome
                        ? { expectedOutcome: verdict.expectedOutcome }
                        : {}),
                      source: verdict.source,
                    },
                  }
            }
          />
        </section>
      ) : null}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 font-medium text-ink-muted">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-control border border-rule bg-sunken p-2 font-mono leading-relaxed text-ink">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
