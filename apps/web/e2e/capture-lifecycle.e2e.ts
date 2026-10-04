import { expect, fakeVoiceAgent, test } from "./fixtures";

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

test("capture: off the record holds the agent, and an agent hang-up ends the capture for good", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  const voice = await fakeVoiceAgent(page);

  await page.goto("/capture");
  await page.getByRole("button", { name: "Start session" }).click();
  const toolbar = page.getByRole("toolbar", { name: "Recording controls" });
  await expect(toolbar).toBeVisible();
  await expect(page.getByRole("status", { name: "Singoda AI is listening" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Questions asked: 0" })).toBeVisible();

  // Off the record: the UI says so and the agent is no longer shown as listening.
  await toolbar.getByRole("button", { name: "Go off the record" }).click();
  await expect(page.getByText("Singoda AI can't hear you and stays silent.")).toBeVisible();
  await expect(page.getByRole("status", { name: "Singoda AI is listening" })).toHaveCount(0);
  await toolbar.getByRole("button", { name: "Back on the record" }).click();
  await expect(page.getByRole("status", { name: "Singoda AI is listening" })).toBeVisible();

  // The agent ends the call: the capture stops, the debrief opens, no new call is opened.
  voice.hangUp();
  await expect(page.getByText("The call ended")).toBeVisible({ timeout: 15_000 });
  await expect(toolbar).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Presenting" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End call" })).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect(voice.connections()).toBe(1);
  expect(errors).toEqual([]);
});
