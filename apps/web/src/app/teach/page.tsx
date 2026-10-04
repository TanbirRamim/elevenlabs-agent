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
    <main className="mx-auto w-full max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <header className="mb-10 max-w-[40rem]">
        <h1 className="font-display text-[2.5rem] leading-[1.05] font-normal tracking-[-0.025em] text-ink sm:text-[3.25rem]">
          Teach
        </h1>
        <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-pretty text-ink-muted">
          Work new tickets on your own. Shadow checks every save against the expert's Work Map and
          stops you before a risky one.
        </p>
      </header>
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
