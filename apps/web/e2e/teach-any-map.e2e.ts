import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { API_URL } from "./env";
import { expect, test } from "./fixtures";

/**
 * /teach with a real captured Work Map: ids like g_fraud / s_security instead of the sample's
 * G1..G6 / S1..S4. The published map is the sample with every id renamed consistently; the
 * presave answer stands in for the live API's judge holding the save with the map's own id.
 */

const RENAMES: Record<string, string> = {
  G1: "g_refund_limit",
  G2: "g_chargeback",
  G3: "g_takeover",
  G4: "g_fraud",
  G5: "g_vip",
  G6: "g_gdpr",
  G7: "g_outage",
  S1: "s_read",
  S2: "s_refund",
  S3: "s_dispute",
  S4: "s_security",
};

const RENAMED_MAP = (() => {
  const raw = readFileSync(new URL("../../../seed/fixtures/workmap.json", import.meta.url), "utf8");
  const json = JSON.stringify(JSON.parse(raw)).replace(/"([GS]\d+)"/g, (whole, id: string) =>
    RENAMES[id] ? `"${RENAMES[id]}"` : whole,
  );
  return { ...JSON.parse(json), id: "wm_captured_real" };
})();

const SAMPLE_ID = /\b[GS]\d\b/;

async function publishRenamedMap(page: Page) {
  await page.route(`${API_URL}/workmaps/published`, (route) =>
    route.fulfill({ json: RENAMED_MAP }),
  );
  await page.route(`${API_URL}/workmaps/wm_captured_real`, (route) =>
    route.fulfill({ json: RENAMED_MAP }),
  );
}

test("teach (real map ids): the guided start reaches a hold citing the map's own rule", async ({
  page,
}) => {
  await publishRenamedMap(page);
  await page.route(`${API_URL}/guard/presave`, (route) =>
    route.fulfill({ json: { decision: "BLOCK", ruleIds: ["g_fraud"], source: "llm_judge" } }),
  );
  await page.goto("/teach");

  const guide = page.getByRole("region", { name: "Try Singoda AI" });
  await expect(guide).toContainText(/Try it: .+ the way a new hire would/);
  await guide.getByRole("button", { name: /^Open \S+$/ }).click();
  const hinted = page.locator("[data-shadow-hint]");
  await expect(hinted).toHaveCount(1);
  await hinted.click();

  await expect(page.getByRole("status").filter({ hasText: "Paused by Singoda AI" })).toBeVisible();
  const chip = page.getByTestId("connector-chip");
  await expect(chip).toHaveText(/^Singoda AI connector · check · BLOCK · \d+ ms · g_fraud$/);
  const panel = page.getByRole("region", { name: "Singoda AI intervention" });
  const fraud = RENAMED_MAP.guardrails.find((g: { id: string }) => g.id === "g_fraud");
  await expect(panel).toContainText(fraud.evidence.quote.text.slice(0, 40));
  expect(await panel.innerText()).not.toMatch(SAMPLE_ID);
});

test("teach (real map ids): offline, the browser fallback still holds the guided save", async ({
  page,
}) => {
  await publishRenamedMap(page);
  await page.route(`${API_URL}/guard/presave`, (route) => route.abort("connectionrefused"));
  await page.goto("/teach");

  const guide = page.getByRole("region", { name: "Try Singoda AI" });
  await guide.getByRole("button", { name: /^Open \S+$/ }).click();
  await page.locator("[data-shadow-hint]").click();

  await expect(page.getByRole("status").filter({ hasText: "Paused by Singoda AI" })).toBeVisible();
  await expect(page.getByTestId("connector-chip")).toHaveText(
    /^Singoda AI connector · in browser · BLOCK · \d+ ms · \S/,
  );
});

test("teach (real map ids): a judgment-point ticket asks for a prediction", async ({ page }) => {
  await publishRenamedMap(page);
  await page.goto("/teach");

  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  await expect(queue).toBeVisible();
  const predict = page.getByRole("region", { name: "Predict the decision" });
  const rows = queue.getByRole("button");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    await predict.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
    if (await predict.isVisible()) break;
  }
  await expect(predict).toBeVisible();
  await expect(predict).toContainText("What would you do here?");
  expect(await predict.innerText()).not.toMatch(SAMPLE_ID);
});
