import { expect, test } from "./fixtures";

/**
 * The demo's Predict beat: opening N2 (a GDPR deletion request) in /teach hits judgment point
 * G6 in the sample Work Map, so Singoda AI asks the new hire what they would do before they act.
 */
test("teach: opening N2 shows the Predict callout for G6", async ({ page }) => {
  await page.goto("/teach");

  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  const n2 = queue.getByRole("button", { name: /^N2\b/ });
  await n2.click();
  await expect(n2).toHaveAttribute("aria-current", "true");

  await expect(page.getByText("What would you do here?")).toBeVisible();
});
