import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { WorkMap } from "@shadow/schema";
import { API_URL } from "./env";
import { expect, test } from "./fixtures";

// The page's sample map is seed/fixtures/workmap.json (src/components/workmap/fixture.ts; its
// unit test asserts they are equal). Read from disk: Playwright's ESM loader would need an
// import attribute for the JSON import inside fixture.ts.
const sampleWorkMap = WorkMap.parse(
  JSON.parse(readFileSync(new URL("../../../seed/fixtures/workmap.json", import.meta.url), "utf8")),
);

test.describe("Work Map with the sample map (?fixture=1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/map/latest?fixture=1");
    await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  });

  test("renders every step of the sample map", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: sampleWorkMap.workflow }),
    ).toBeVisible();
    const timeline = page.getByRole("list", { name: "Steps" });
    for (const step of sampleWorkMap.steps) {
      await expect(timeline.getByText(step.title, { exact: true })).toBeVisible();
    }
  });

  test("selecting a step shows its verbatim quote", async ({ page }) => {
    const step = sampleWorkMap.steps.find((s) => s.id === "S4");
    if (!step) throw new Error("sample map has no step S4");
    await page.getByRole("button", { name: new RegExp(step.title) }).click();
    const detail = page.getByRole("region", { name: "Step detail" });
    // S4's reason is also the evidence quote of its guardrail G3, so it can show twice.
    await expect(detail.getByText(`“${step.reason.text}”`).first()).toBeVisible();
    await expect(detail.getByText(step.decision, { exact: true })).toBeVisible();
  });

  test("the guardrail type filter narrows the list", async ({ page }) => {
    const list = page.getByRole("list", { name: "Guardrail list" });
    const all = sampleWorkMap.guardrails.length;
    await expect(list.getByRole("listitem")).toHaveCount(all);

    const never = sampleWorkMap.guardrails.filter((g) => g.type === "never");
    await page.getByRole("radio", { name: `Never (${never.length})` }).click();
    await expect(list.getByRole("listitem")).toHaveCount(never.length);
    for (const g of never) await expect(list.getByText(g.condition)).toBeVisible();

    await page.getByRole("radio", { name: "All", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(all);
  });
});

test.describe("Work Map evidence for a recorded session", () => {
  test("serves the step's frame by session and shows it when there is no recording", async ({
    page,
    request,
  }) => {
    const created = await request.post(`${API_URL}/sessions`, { data: { mode: "capture" } });
    const { id: sessionId } = (await created.json()) as { id: string };
    const frameId = sampleWorkMap.steps[0]?.moment.frameId;
    if (!frameId) throw new Error("sample map has no steps");
    // Without S3 the API keeps objects on disk (apps/api/src/main.ts), under the key the frame
    // pipeline writes: frames/<sessionId>/<frameId>.jpg. A capture in fixture mode stores no
    // frames, so this test puts one there itself.
    const dir = new URL(`../../../infra/data/objects/frames/${sessionId}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });
    // A decodable JPEG: the player probes frames by loading them as images.
    const jpeg = readFileSync(new URL("./assets/frame.jpg", import.meta.url));
    writeFileSync(new URL(`${frameId}.jpg`, dir), jpeg);

    await page.goto(`/map/latest?fixture=1&session=${sessionId}`);
    const frameSrc = `${API_URL}/sessions/${sessionId}/frames/${frameId}.jpg`;
    const frame = await request.get(frameSrc);
    expect(frame.status()).toBe(200);
    expect(frame.headers()["content-type"]).toBe("image/jpeg");

    // The session never uploaded a recording: its stored frame plays instead of a broken player.
    const still = page.getByRole("img", { name: /^Redacted screen at / }).first();
    await expect(still).toBeVisible();
    expect(await still.getAttribute("src")).toBe(frameSrc);
    await expect(page.getByRole("button", { name: "Play clip" })).toHaveCount(0);
  });
});
