import { API_URL } from "./env";
import { expect, test } from "./fixtures";

test("capture loads the expert tickets into DeskSim and shows the side panel", async ({
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

  // Side panel: voice not started (no ElevenLabs session), off-the-record control present.
  await expect(page.getByText("Not started")).toBeVisible();
  await expect(page.getByRole("button", { name: /Go off the record/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share this tab and start" })).toBeVisible();

  const t3 = tickets.find((t) => t.id === "T3");
  if (!t3) throw new Error("seed has no expert ticket T3");
  const t3Button = queue.getByRole("button", { name: /^T3\b/ });
  await t3Button.click();
  await expect(t3Button).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(t3.subject) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeEnabled();
});

// FIXME: lib/voice/useVoice.ts calls sendContextualUpdate / sendUserActivity while no ElevenLabs
// session is active, so opening a ticket before "Share this tab and start" throws
// "No active conversation. Call startSession() first." in the browser. Enable once fixed.
test.fixme("capture: working the desk before voice starts raises no page errors", async ({
  page,
}) => {
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
