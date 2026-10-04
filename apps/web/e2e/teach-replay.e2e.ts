import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { API_URL } from "./env";
import { expect, test } from "./fixtures";

/**
 * /teach replays the expert's screen moment from the published map's own capture session
 * (`sourceSessionId`), with no `?expertSession=` in the URL. The API is mocked per test: the
 * published map is the sample map linked to a session, and that session's recording and frames
 * are test assets (e2e/assets), so the clip states do not depend on a real capture.
 */

const SOURCE_SESSION = "sess_replay_e2e";
const SAMPLE_MAP = JSON.parse(
  readFileSync(new URL("../../../seed/fixtures/workmap.json", import.meta.url), "utf8"),
);
const WEBM = readFileSync(new URL("./assets/replay.webm", import.meta.url));
const JPEG = readFileSync(new URL("./assets/frame.jpg", import.meta.url));
const NO_REPLAY = "Screen replay appears for maps captured in a live session.";

async function publish(page: Page, map: object) {
  await page.route(`${API_URL}/workmaps/published`, (route) => route.fulfill({ json: map }));
  await page.route(`${API_URL}/guard/presave`, (route) =>
    route.fulfill({ json: { decision: "BLOCK", ruleIds: ["G4"], source: "llm_judge" } }),
  );
}

async function holdGuidedSave(page: Page) {
  await page.goto("/teach");
  const guide = page.getByRole("region", { name: "Try Singoda AI" });
  await guide.getByRole("button", { name: /^Open \S+$/ }).click();
  await page.locator("[data-shadow-hint]").click();
  await expect(page.getByRole("status").filter({ hasText: "Paused by Singoda AI" })).toBeVisible();
  return page.getByRole("region", { name: "Singoda AI intervention" });
}

test("teach: a published map with a source session plays its clip without query params", async ({
  page,
}) => {
  await publish(page, { ...SAMPLE_MAP, sourceSessionId: SOURCE_SESSION });
  await page.route(`${API_URL}/sessions/${SOURCE_SESSION}/recording`, (route) =>
    route.fulfill({ status: 200, contentType: "video/webm", body: WEBM }),
  );

  const panel = await holdGuidedSave(page);
  await panel.getByRole("button", { name: /^Play .+'s clip/ }).click();

  const dialog = page.getByRole("dialog");
  const video = dialog.getByLabel(/^Session clip /);
  await expect(video).toBeVisible();
  expect(await video.getAttribute("src")).toContain(`/sessions/${SOURCE_SESSION}/recording#t=`);
  // The recording loaded: metadata is in, so the player is not a broken element.
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(dialog.getByText(NO_REPLAY)).toHaveCount(0);
});

test("teach: without a recording the stored frames play as a slideshow", async ({ page }) => {
  await publish(page, { ...SAMPLE_MAP, sourceSessionId: SOURCE_SESSION });
  await page.route(`${API_URL}/sessions/${SOURCE_SESSION}/recording`, (route) =>
    route.fulfill({ status: 404, json: { code: "no_recording" } }),
  );
  await page.route(`${API_URL}/sessions/${SOURCE_SESSION}/frames/*.jpg`, (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG }),
  );

  const panel = await holdGuidedSave(page);
  await panel.getByRole("button", { name: /^Play .+'s clip/ }).click();

  const dialog = page.getByRole("dialog");
  const frame = dialog.getByRole("img", { name: /^Redacted screen at / });
  await expect(frame).toBeVisible();
  expect(await frame.getAttribute("src")).toMatch(
    new RegExp(`/sessions/${SOURCE_SESSION}/frames/f_\\d\\.jpg$`),
  );
  await expect(dialog.locator("video")).toHaveCount(0);
});

test("teach: the sample map shows the expert's words and an honest note, no dead clip button", async ({
  page,
}) => {
  await publish(page, SAMPLE_MAP);
  const panel = await holdGuidedSave(page);
  await expect(panel.getByText(NO_REPLAY)).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Play .+'s clip/ })).toHaveCount(0);
  await expect(page.getByText(/not linked/i)).toHaveCount(0);
});
