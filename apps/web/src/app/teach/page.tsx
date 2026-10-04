import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { TeachSession } from "./TeachSession";

export const metadata: Metadata = { title: "Teach · Shadow" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

export default async function TeachPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Teach</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Work new tickets on your own. Shadow checks every save against the expert's Work Map and
        stops you before a risky one.
      </p>
      <VoiceProvider>
        <TeachSession
          workMapId={first(query.workMap)}
          expertSessionId={first(query.expertSession)}
          learnerName={first(query.learner)}
        />
      </VoiceProvider>
    </main>
  );
}
