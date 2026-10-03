import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MachineRule, Ticket } from "@shadow/schema";
import { z } from "zod";
import type { RuleRef } from "./index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export function loadTickets(): Ticket[] {
  return z.array(Ticket).parse(JSON.parse(readFileSync(`${root}seed/tickets.json`, "utf8")));
}

export function loadReferenceRules(): RuleRef[] {
  const raw = JSON.parse(readFileSync(`${root}seed/reference-guardrails.json`, "utf8"));
  return z
    .object({
      rules: z.array(z.object({ id: z.string(), machineRule: MachineRule }).passthrough()),
    })
    .parse(raw).rules;
}
