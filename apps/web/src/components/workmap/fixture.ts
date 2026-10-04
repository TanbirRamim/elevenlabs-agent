import { WorkMap } from "@shadow/schema";
import workMapJson from "../../../../../seed/fixtures/workmap.json";

/**
 * Sample Work Map for the support-escalation workflow: the very same file the API serves in
 * `MOCK_AI` mode and that Teach, Copilot, the guard and the evals read
 * (`seed/fixtures/workmap.json`), so a guardrail id means the same thing on every page.
 *
 * Sample data, not demo truth. The web shows it only when the API is unreachable or
 * `?fixture=1` is set, always with a visible "sample data" badge, and the /demo replay quotes
 * it. The live demo derives its map from the expert's own session.
 */
export const sampleWorkMap: WorkMap = WorkMap.parse(workMapJson);
