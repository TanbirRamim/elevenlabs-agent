import { API_URL } from "./env";
import { committedActions, expect, recordSentFrames, test } from "./fixtures";

/**
 * The demo's core moment: a new hire refunds N1 (card used without permission) and Shadow
 * pauses the save before it happens, because guardrail G4 says route it to Security.
 */

test("guard API blocks N1 -> Refund with G4 (the rule path the /teach demo relies on)", async ({
  request,
}) => {
  const res = await request.get(`${API_URL}/tickets?set=new_hire`);
  expect(res.ok()).toBe(true);
  const { tickets } = (await res.json()) as { tickets: { id: string; amountEur?: number }[] };
  const n1 = tickets.find((t) => t.id === "N1");
  if (!n1) throw new Error("seed has no new-hire ticket N1");

  const verdictRes = await request.post(`${API_URL}/guard/presave`, {
    data: {
      ticket: n1,
      outcome: "refund",
      ...(n1.amountEur !== undefined ? { amountEur: n1.amountEur } : {}),
    },
  });
  expect(verdictRes.ok()).toBe(true);
  const verdict = (await verdictRes.json()) as {
    decision: string;
    ruleIds: string[];
    expectedOutcome?: string;
  };
  expect(verdict.decision).toBe("BLOCK");
  expect(verdict.ruleIds).toContain("G4");
  expect(verdict.expectedOutcome).toBe("handoff_security");
});

// FIXME(TAN-12): enable when /teach (TAN-10) hosts <DeskSim mode="teach"> with preSave wired to
// /guard/presave. Today apps/web/src/app/teach/page.tsx is a placeholder with no DeskSim.
test.fixme("teach: N1 -> Refund is paused by Shadow and never committed", async ({ page }) => {
  const frames = recordSentFrames(page);
  await page.goto("/teach");

  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  const n1 = queue.getByRole("button", { name: /^N1\b/ });
  await n1.click();
  await expect(n1).toHaveAttribute("aria-current", "true");

  const verdict = page.waitForResponse(
    (r) => r.url() === `${API_URL}/guard/presave` && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  expect((await verdict).ok()).toBe(true);

  await expect(page.getByRole("status").filter({ hasText: "Paused by Shadow" })).toBeVisible();
  await expect(page.getByText(/rule .*G4/)).toBeVisible();
  await expect(page.getByText(/^Committed:/)).toHaveCount(0);

  expect(committedActions(frames)).not.toContainEqual({ ticketId: "N1", outcome: "refund" });
});
