import { formatClock } from "./format";
import type { VisionLine } from "./visionLines";

/** The latest events Claude read off the shared screen, newest first. Pure props in, UI out. */
export function VisionFeed({ lines }: { lines: VisionLine[] }) {
  return (
    <section aria-label="What Claude sees" className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-ink">What Claude sees</p>
      {lines.length === 0 ? (
        <p className="text-ui text-ink-muted">No screen events yet.</p>
      ) : (
        <ol className="flex flex-col gap-0.5 font-mono text-xs">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-2">
              <span className="figures text-ink-faint">{formatClock(l.tMs)}</span>
              <span className="text-ink">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
