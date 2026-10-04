import { Check } from "lucide-react";
import { mmss } from "../../lib/voice/protocol";
import { Badge } from "../ui";

export interface ConfirmedBadgeProps {
  /** Session time the teach-back was confirmed; null when it was not. */
  confirmedAtMs: number | null;
}

/** "Confirmed at 07:42": the expert signed off on Singoda AI's teach-back at this session time. */
export function ConfirmedBadge({ confirmedAtMs }: ConfirmedBadgeProps) {
  if (confirmedAtMs === null) {
    return (
      <Badge tone="muted" dot>
        Teach-back not confirmed
      </Badge>
    );
  }
  return (
    <Badge tone="ok" icon={<Check aria-hidden="true" />}>
      Confirmed at <time className="figures font-mono">{mmss(confirmedAtMs)}</time>
    </Badge>
  );
}
