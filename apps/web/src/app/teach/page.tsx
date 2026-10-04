import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { TeachSession } from "./TeachSession";

export const metadata: Metadata = { title: "Teach · Shadow" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

/**
 * No Shadow chrome here (the route is "naked" in the shell): the page IS the standalone DeskSim
 * ticketing app the new hire works in. Shadow is the floating dock, plus the pause the Shadow
 * connector puts on a risky save before it commits (docs/CONNECTOR.md).
 */
export default async function TeachPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  return (
    <VoiceProvider>
      <TeachSession
        workMapId={first(query.workMap)}
        expertSessionId={first(query.expertSession)}
        learnerName={first(query.learner)}
      />
    </VoiceProvider>
  );
}
