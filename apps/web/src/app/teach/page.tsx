import type { Metadata } from "next";
import { Page } from "@/components/shell/Page";
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
    <Page width="wide">
      <VoiceProvider>
        <TeachSession
          workMapId={first(query.workMap)}
          expertSessionId={first(query.expertSession)}
          learnerName={first(query.learner)}
        />
      </VoiceProvider>
    </Page>
  );
}
