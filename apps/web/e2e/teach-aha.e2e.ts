import type { Page } from "@playwright/test";
import { API_URL } from "./env";
import { committedActions, expect, recordSentFrames, test } from "./fixtures";

/** The guided path, the visible connector call, and the browser fallback on /teach. */

const SHOTS = process.env.AHA_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(500); // let fade-ins settle
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const PRESAVE = `${API_URL}/guard/presave`;

test("teach: a fresh visit reaches 'Paused by Singoda AI' in two clicks", async ({ page }) => {
  await page.goto("/teach");
  const guide = page.getByRole("region", { name: "Try Singoda AI" });
  await expect(guide).toContainText("Try it: refund N1 the way a new hire would");
  await shot(page, "1-fresh-visit-callout");

  await guide.getByRole("button", { name: "Open N1" }).click(); // click 1
  const refund = page.getByRole("button", { name: "Refund", exact: true });
  await expect(refund).toHaveAttribute("data-shadow-hint");
  await refund.click(); // click 2

  const paused = page.getByRole("status").filter({ hasText: "Paused by Singoda AI" });
  await expect(paused).toBeVisible();
  const chip = page.getByTestId("connector-chip");
  await expect(chip).toHaveText(/^Singoda AI connector · check · BLOCK · \d+ ms · .*G4/);
  await page.getByRole("button", { name: "View request" }).click();
  const json = page.getByRole("region", { name: "Connector request and response" });
  await expect(json).toContainText('"url": "http://localhost');
  await expect(json).toContainText('"decision": "BLOCK"');
  await shot(page, "2-hold-card-chip-json");

  // Dismissed for good: a reload does not bring the guide back.
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Ticket queue" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Try Singoda AI" })).toHaveCount(0);
});

test("teach: an allowed save shows a subtle ALLOW chip", async ({ page }) => {
  await page.goto("/teach");
  await page
    .getByRole("navigation", { name: "Ticket queue" })
    .getByRole("button", { name: /^N1\b/ })
    .click();
  await page.getByRole("button", { name: "Handoff: Security", exact: true }).click();
  await expect(page.getByText(/^Committed: Handoff: Security/)).toBeVisible();
  await expect(page.getByTestId("connector-chip")).toHaveText(
    /^Singoda AI connector · check · ALLOW · \d+ ms$/,
  );
});

test("teach: after N1 is held, opening N2 still asks for a prediction", async ({ page }) => {
  await page.goto("/teach");
  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  await queue.getByRole("button", { name: /^N1\b/ }).click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Paused by Singoda AI" })).toBeVisible();

  await queue.getByRole("button", { name: /^N2\b/ }).click();
  await expect(page.getByText("What would you do here?")).toBeVisible();
});

test("teach: with the API offline, Singoda AI's rules still hold N1 in the browser", async ({
  page,
}) => {
  const frames = recordSentFrames(page);
  await page.goto("/teach");
  await page.route(PRESAVE, (route) => route.abort("connectionrefused"));

  await page
    .getByRole("navigation", { name: "Ticket queue" })
    .getByRole("button", { name: /^N1\b/ })
    .click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();

  await expect(
    page.getByText("Live API offline — running Singoda AI's rules in the browser"),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Paused by Singoda AI" })).toBeVisible();
  await expect(page.getByTestId("connector-chip")).toHaveText(
    /^Singoda AI connector · in browser · BLOCK · \d+ ms · .*G4/,
  );
  expect(committedActions(frames)).not.toContainEqual({ ticketId: "N1", outcome: "refund" });
  await shot(page, "3-offline-banner");
});
