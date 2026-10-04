"use client";

import type { Outcome } from "@shadow/schema";
import { ArrowRight, X } from "lucide-react";
import { ACTION_LABELS } from "@/components/desk/ActionBar";
import { Avatar, Button, IconButton } from "@/components/ui";

/**
 * The guided first click, over the empty inbox on a fresh visit: one click opens the ticket a
 * loaded rule would hold and points at the action it forbids (usually Refund); the second click
 * is the save Singoda AI pauses.
 */
export function GuidedStart({
  ticketId,
  outcome,
  onStart,
  onDismiss,
}: {
  ticketId: string;
  /** The action a loaded rule would hold on this ticket. */
  outcome: Outcome;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <section aria-label="Try Singoda AI" className="flex items-start gap-3 px-4 py-3.5">
      <Avatar name="Singoda AI" shadow size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-ink">
          {outcome === "refund" ? (
            <>
              Try it: refund <span className="font-mono">{ticketId}</span> the way a new hire would
            </>
          ) : (
            <>
              Try it: choose {ACTION_LABELS[outcome]} on{" "}
              <span className="font-mono">{ticketId}</span> the way a new hire would
            </>
          )}
        </p>
        <p className="mt-0.5 text-ui text-ink-muted">
          Singoda AI checks every save before it happens. Watch what it does with this one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<ArrowRight aria-hidden="true" />} onClick={onStart}>
            Open {ticketId}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            I'll explore on my own
          </Button>
        </div>
      </div>
      <IconButton size="sm" label="Dismiss" onClick={onDismiss}>
        <X />
      </IconButton>
    </section>
  );
}
