import { WorkMapView } from "@/components/workmap/WorkMapView";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : null;
}

export default async function WorkMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const sessionId = first(query.session);
  const fixture = first(query.fixture);
  const forceFixture = fixture === "1" || fixture === "true";
  return <WorkMapView id={id} sessionId={sessionId} forceFixture={forceFixture} />;
}
