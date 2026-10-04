import { expect, test } from "./fixtures";

/**
 * /capture and /teach are "naked" routes (the standalone DeskSim app with a floating Singoda AI
 * dock), so the Singoda AI nav in the app bar and the docks is the only way back to the website.
 */

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--auto-accept-this-tab-capture",
    ],
  },
});

for (const route of ["/capture", "/teach"]) {
  test(`${route}: the Singoda AI home link goes back to the website`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "Ticket queue" })).toBeVisible();
    await page.getByRole("link", { name: "Singoda AI home" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("judgment");
  });
}

test("/teach: the Singoda AI menu lists the product and navigates", async ({ page }) => {
  await page.goto("/teach");
  await expect(page.getByRole("navigation", { name: "Ticket queue" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Singoda AI", exact: true }).first();
  await nav.getByRole("button", { name: "Singoda AI menu" }).click();
  for (const label of ["Home", "Capture", "Work Maps", "Teach", "Copilot", "Replay"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Teach", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Replay", exact: true }).click();
  await expect(page).toHaveURL(/\/demo$/);
});

test("/capture: leaving while presenting asks first and stops sharing", async ({ page }) => {
  await page.goto("/capture");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("toolbar", { name: "Recording controls" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Presenting" })).toContainText(
    "You are presenting to Singoda AI",
  );

  const home = page.getByRole("link", { name: "Singoda AI home" }).first();
  await home.click();
  const dialog = page.getByRole("dialog", { name: "Stop presenting and leave?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep presenting" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole("toolbar", { name: "Recording controls" })).toBeVisible();

  await home.click();
  await dialog.getByRole("button", { name: "Stop and leave" }).click();
  await expect(page).toHaveURL(/\/$/);
});
