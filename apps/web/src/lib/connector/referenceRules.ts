import type { RuleRef } from "@shadow/guard";
import { MachineRule } from "@shadow/schema";
import { z } from "zod";
import referenceJson from "../../../../../seed/reference-guardrails.json";

/**
 * The reference guardrails from seed/, bundled for the connector's offline fallback only
 * (the file's own comment allows that use). When the API is unreachable and no Work Map was
 * loaded, these machine rules still hold a save that breaks one. Never shown to the tutor.
 */
export const REFERENCE_RULES: readonly RuleRef[] = z
  .object({
    rules: z.array(z.object({ id: z.string(), machineRule: MachineRule }).passthrough()),
  })
  .parse(referenceJson)
  .rules.map(({ id, machineRule }) => ({ id, machineRule }));
