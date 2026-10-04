import type { Metadata } from "next";
import { CopilotView } from "@/components/copilot/CopilotView";

export const metadata: Metadata = { title: "Copilot · Shadow" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

/** `/copilot` runs the published Work Map; `/copilot?map=<id>` runs a specific one. */
export default async function CopilotPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  return <CopilotView mapId={first(query.map)} />;
}
