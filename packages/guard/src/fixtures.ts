import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MachineRule, Ticket } from "@shadow/schema";
import { z } from "zod";
import type { RuleRef } from "./index.js";

/**
 * Locates the repo's seed/ directory. SHADOW_SEED_DIR wins; otherwise walk up from the
 * working directory. Works in the monorepo (any package cwd) and in the API container (/app/seed).
 */
export function findSeedDir(start = process.cwd()): string {
  const fromEnv = process.env.SHADOW_SEED_DIR;
  if (fromEnv) return resolve(fromEnv);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "seed", "tickets.json"))) return join(dir, "seed");
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`seed/tickets.json not found above ${start}`);
    dir = parent;
  }
}

export function loadTickets(seedDir = findSeedDir()): Ticket[] {
  return z.array(Ticket).parse(JSON.parse(readFileSync(join(seedDir, "tickets.json"), "utf8")));
}

export function loadReferenceRules(seedDir = findSeedDir()): RuleRef[] {
  const raw = JSON.parse(readFileSync(join(seedDir, "reference-guardrails.json"), "utf8"));
  return z
    .object({
      rules: z.array(z.object({ id: z.string(), machineRule: MachineRule }).passthrough()),
    })
    .parse(raw).rules;
}
