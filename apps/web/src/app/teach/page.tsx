import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { TeachSession } from "./TeachSession";

export const metadata: Metadata = { title: "Teach · Singoda AI" };

/**
 * The learner's name when the link has no `?learner=`: the name the tutor greets
 * (`{{learner_name}}`) and the dock shows, so neither reads "New hire · " with no one in it.
 */
const DEFAULT_LEARNER_NAME = "Jonas";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

/**
 * No Singoda AI chrome here (the route is "naked" in the shell): the page IS the standalone DeskSim
 * ticketing app the new hire works in. Singoda AI is the floating dock, plus the pause the Singoda AI
 * connector puts on a risky save before it commits (docs/CONNECTOR.md).
 */
export default async function TeachPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  return (
    <VoiceProvider>
      <TeachSession
        workMapId={first(query.workMap)}
        expertSessionId={first(query.expertSession)}
        learnerName={first(query.learner) ?? DEFAULT_LEARNER_NAME}
      />
    </VoiceProvider>
  );
}
