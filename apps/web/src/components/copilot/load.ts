import type { AgentExport, CopilotRun } from "@shadow/schema";
import { type ApiClient, api } from "../../lib/api";

export interface CopilotData {
  run: CopilotRun;
  exported: AgentExport;
}

export type CopilotClient = Pick<ApiClient, "runCopilot" | "getAgentExport">;

/**
 * Runs the Copilot for `mapId`, or for the published map when `mapId` is null (the API takes
 * "published" for both routes; in MOCK_AI mode that is the fixture map). Errors are the
 * client's `ApiClientError`s, never papered over.
 */
export async function loadCopilot(
  mapId: string | null,
  client: CopilotClient = api,
): Promise<CopilotData> {
  const id = mapId ?? "published";
  const [run, exported] = await Promise.all([client.runCopilot(id), client.getAgentExport(id)]);
  return { run, exported };
}
