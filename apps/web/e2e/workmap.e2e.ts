import { sampleWorkMap } from "../src/components/workmap/fixture";
import { expect, test } from "./fixtures";

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
    await expect(detail.getByText(`“${step.reason.text}”`)).toBeVisible();
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
