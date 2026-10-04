import { expect, test } from "./fixtures";

test("home states the product and links to every module", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("judgment");
  const nav = page.getByRole("navigation").first();
  for (const label of ["Capture", "Work Map", "Teach"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
});

test("nav: Work Map link opens the published map from the API", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Work Map", exact: true }).click();
  await expect(page).toHaveURL(/\/map\/latest$/);
  // MOCK_AI serves the fixture map; the page shows it as API data, not as the sample.
  await expect(page.getByRole("list", { name: "Steps" })).toBeVisible();
  await expect(page.getByText("Sample data", { exact: true })).toHaveCount(0);
});

test("nav: Capture link opens the capture page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Capture", exact: true }).click();
  await expect(page).toHaveURL(/\/capture$/);
  // Capture is the standalone DeskSim app with Singoda AI's dock, not a page with a heading (#78).
  await expect(page.getByRole("region", { name: "Support inbox" })).toBeVisible();
});

test("home: proof chips and the primary CTA to Teach", async ({ page }) => {
  await page.goto("/");
  const proof = page.getByRole("list", { name: "Proof" });
  await expect(proof).toContainText("9/9 caught, 0/16 false blocks");
  await page.getByRole("link", { name: "See it stop a wrong refund" }).click();
  await expect(page).toHaveURL(/\/teach$/);
});
