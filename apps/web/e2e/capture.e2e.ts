import { API_URL } from "./env";
import { expect, test } from "./fixtures";

test("capture loads the expert tickets into DeskSim and shows the preflight", async ({
  page,
  request,
}) => {
  const res = await request.get(`${API_URL}/tickets?set=expert`);
  expect(res.ok()).toBe(true);
  const { tickets } = (await res.json()) as { tickets: { id: string; subject: string }[] };
  expect(tickets.length).toBeGreaterThan(0);

  await page.goto("/capture");
  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  for (const t of tickets) {
    await expect(queue.getByRole("button", { name: new RegExp(`^${t.id}\\b`) })).toBeVisible();
  }
  await expect(page.getByText("Select a ticket to begin (capture mode).")).toBeVisible();

  // Preflight: the stubbed voice agent fails honestly with a fix, screen share waits for the
  // expert, redaction is ready, and the session can still start (without voice).
  const checks = page.getByRole("list", { name: "Preflight checks" });
  const agent = checks.getByRole("listitem").filter({ hasText: "Voice agent" });
  await expect(agent).toContainText("Needs attention");
  await expect(agent).toContainText("voice_disabled_in_e2e");
  await expect(checks.getByRole("listitem").filter({ hasText: "Redaction" })).toContainText(
    "Ready",
  );
  await expect(checks.getByRole("button", { name: "Share this tab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  await expect(page.getByText(/Without voice, Singoda AI follows the desk silently/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start session" })).toBeEnabled();
  // Nothing records before Start: no recording controls, no off-the-record toggle yet.
  await expect(page.getByRole("toolbar", { name: "Recording controls" })).toHaveCount(0);

  const t3 = tickets.find((t) => t.id === "T3");
  if (!t3) throw new Error("seed has no expert ticket T3");
  const t3Button = queue.getByRole("button", { name: /^T3\b/ });
  await t3Button.click();
  await expect(t3Button).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(t3.subject) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeEnabled();
});

// Regression: voice sends before the session starts used to throw
// "No active conversation"; useVoice now drops them while disconnected.
test("capture: working the desk before voice starts raises no page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/capture");
  const queue = page.getByRole("navigation", { name: "Ticket queue" });
  const t3 = queue.getByRole("button", { name: /^T3\b/ });
  await t3.click();
  await expect(t3).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Hold / request info", exact: true }).click();
  await expect(page.getByText(/^Committed:/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("capture: ?intent=start from the command menu focuses Start session", async ({ page }) => {
  await page.goto("/capture?intent=start");
  await expect(page.getByRole("button", { name: "Start session" })).toBeFocused();
  await expect(page).toHaveURL(/\/capture$/);
});
