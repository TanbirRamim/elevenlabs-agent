import { expect, test } from "./fixtures";

/** `/demo`: the 90-second replay judges open on their own, without mic or screen share. */

const chapterHeading = (page: import("@playwright/test").Page) =>
  page.getByRole("heading", { level: 2 }).first();

test("demo: autoplays muted, labelled honestly as a replay", async ({ page }) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Shadow, in 90 seconds" }),
  ).toBeVisible();
  await expect(page.getByText("Replay of a recorded session")).toBeVisible();
  await expect(page.getByRole("link", { name: "Capture", exact: true }).last()).toHaveAttribute(
    "href",
    "/capture",
  );
  const position = page.getByRole("slider", { name: "Replay position" });
  await expect(position).not.toHaveValue("0");
  await expect(page.getByRole("button", { name: "Pause the replay" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Captions" })).toBeVisible();
});

test("demo: scrubbing to Act 3 shows Shadow pausing the wrong refund", async ({ page }) => {
  await page.goto("/demo");
  await page.keyboard.press("Space"); // pause the autoplay
  await expect(page.getByRole("button", { name: "Play the replay" })).toBeVisible();

  await page.getByRole("slider", { name: "Replay position" }).fill("69000");
  await expect(chapterHeading(page)).toContainText("Teach");
  const paused = page.getByRole("status").filter({ hasText: "Paused by Shadow" });
  await expect(paused).toBeVisible();
  await expect(paused).toContainText("G4");
  await expect(page.getByRole("region", { name: "Shadow intervention" })).toContainText(
    "Maya would stop here. Why do you think?",
  );
});

test("demo: Act 3 asks Jonas to predict on N2 before the N1 intercept", async ({ page }) => {
  await page.goto("/demo");
  await page.keyboard.press("Space");
  await page.getByRole("slider", { name: "Replay position" }).fill("61500");
  await expect(chapterHeading(page)).toContainText("Teach");
  const predict = page.getByRole("region", { name: "Predict the decision" });
  await expect(predict).toContainText("judgment point on N2");
  await expect(predict).toContainText("Right call.");
  await expect(predict).toContainText("Legal");
});

test("demo: story mode shows Shadow's first question within 8 s", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText(/^Shadow asks/).first()).toBeVisible({ timeout: 8_000 });
});

test("demo: keyboard controls play, pause, seek and jump chapters", async ({ page }) => {
  await page.goto("/demo");
  const position = page.getByRole("slider", { name: "Replay position" });

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play the replay" })).toBeVisible();

  await page.keyboard.press("Home");
  await expect(position).toHaveValue("0");
  await expect(chapterHeading(page)).toContainText("Capture");

  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveValue("5000");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveValue("5000");

  await page.keyboard.press("3");
  await expect(chapterHeading(page)).toContainText("Teach");
  await page.keyboard.press("2");
  await expect(chapterHeading(page)).toContainText("Map");

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause the replay" })).toBeVisible();
  const before = Number(await position.inputValue());
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(before);
});

test("demo: the Turn Gate timeline explains each question", async ({ page }) => {
  await page.goto("/demo");
  await page.keyboard.press("Space");
  await page.getByRole("slider", { name: "Replay position" }).fill("9000");
  const marker = page.getByRole("button", { name: /^Question 1 at / });
  await marker.focus();
  await expect(page.getByRole("tooltip")).toContainText("The gate opened after");
});

test("home: hero links to the replay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Watch it work · 90 s" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("demo: does not autoplay and steps between whole moments", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Play the replay" })).toBeVisible();
    const position = page.getByRole("slider", { name: "Replay position" });
    await expect(position).toHaveValue("0");
    await page.keyboard.press("ArrowRight");
    const first = Number(await position.inputValue());
    expect(first).toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    expect(Number(await position.inputValue())).toBeGreaterThan(first);
    await page.keyboard.press("ArrowLeft");
    await expect(position).toHaveValue(String(first));
  });
});
