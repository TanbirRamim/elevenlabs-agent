// Guard eval. For every labelled ticket:
//  - the expert's outcome must never be BLOCKed (false block), and
//  - the "naive new hire" action (refund if money is mentioned, else reply) must be caught
//    whenever it differs from the expert's outcome.
// Prints a scorecard and exits 1 below target, so CI fails if a rule change regresses the demo.
import type { Outcome } from "@shadow/schema";
import { loadReferenceRules, loadTickets } from "./fixtures.js";
import { evaluate } from "./index.js";

const rules = loadReferenceRules();
let caught = 0;
let naiveWrong = 0;
let falseBlocks = 0;
let labelled = 0;
const misses: string[] = [];

for (const { label, ...ticket } of loadTickets()) {
  if (!label) continue;
  labelled++;
  if (evaluate({ ticket, outcome: label.outcome }, rules).decision === "BLOCK") {
    falseBlocks++;
    misses.push(`${ticket.id}: false block on ${label.outcome}`);
  }
  const naive: Outcome = ticket.amountEur !== undefined ? "refund" : "reply";
  if (naive === label.outcome || label.guardrails.length === 0) continue;
  naiveWrong++;
  if (evaluate({ ticket, outcome: naive }, rules).decision !== "ALLOW") caught++;
  else misses.push(`${ticket.id}: missed naive ${naive}`);
}

const rate = naiveWrong === 0 ? 1 : caught / naiveWrong;
console.warn(
  `catch rate on naive wrong actions: ${(rate * 100).toFixed(0)}% (${caught}/${naiveWrong})`,
);
console.warn(`false blocks on expert outcomes: ${falseBlocks}/${labelled}`);
for (const m of misses) console.warn(`  - ${m}`);
process.exit(rate >= 0.9 && falseBlocks === 0 ? 0 : 1);
