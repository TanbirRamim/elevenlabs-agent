import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { WorkMap } from "@shadow/schema";
import { API_URL } from "./env";
import {
  committedActions,
  expect,
  fakeVoiceAgent,
  recordReceivedFrames,
  recordSentFrames,
  type SentFrame,
  test,
} from "./fixtures";

/**
 * Acceptance: the four pass/fail requirements of Challenge 01 (docs/IMPLEMENTATION_PLAN.md §1.1),
 * proven on the real UI flow. The API runs with MOCK_AI=1 (fixture Curiosity Engine, debrief and
 * map); the voice agent is a fake ElevenAgents WebSocket (fixtures.ts) so every hidden control
 * message the page sends is recorded. Chromium's fake media gives a real mic and a real tab share.
 *
 * Time: the page clock is installed and runs at real speed; the seconds the expert spends reading
 * between tickets are skipped with `clock.fastForward`, so the session keeps the demo's pacing
 * (four tickets in about 2:30, docs/IMPLEMENTATION_PLAN.md §12) without the test taking that long.
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

const fixtureMap = WorkMap.parse(
  JSON.parse(readFileSync(new URL("../../../seed/fixtures/workmap.json", import.meta.url), "utf8")),
);

/** Turn Gate thresholds the acceptance criteria name ("silence ≥ 1.5 s, no typing ≥ 3 s"). */
const SILENCE_MS = 1500;
const INPUT_IDLE_MS = 3000;

type Msg = { type?: string; [k: string]: unknown };
const STREAM_URL = API_URL.replace(/^http/, "ws");
const sessionMsgs = (frames: SentFrame[]): Msg[] =>
  frames
    .filter((f) => f.url.startsWith(STREAM_URL))
    .map((f) => f.message)
    .filter((m): m is Msg => typeof m === "object" && m !== null);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function openTicket(page: Page, id: string) {
  const button = page
    .getByRole("navigation", { name: "Ticket queue" })
    .getByRole("button", { name: new RegExp(`^${id}\\b`) });
  await button.click();
  await expect(button).toHaveAttribute("aria-current", "true");
}

/** Types into the reply box key by key, like a person (each key is DeskSim input activity). */
async function typeReply(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Reply to the customer" })
    .pressSequentially(text, { delay: 120 });
}

async function act(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByText(new RegExp(`^Committed: ${escapeRe(label)}`))).toBeVisible();
}

test("Challenge 01 acceptance: live questions, debrief, evidence-linked map, tutor catch", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  const voice = await fakeVoiceAgent(page);
  const sent = recordSentFrames(page);
  const received = recordReceivedFrames(page);
  const asks = () => voice.controls.filter((c) => c.prefix === "[ASK]");

  // ---------------------------------------------------------------- Capture
  await page.goto("/capture");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("toolbar", { name: "Recording controls" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Shadow is listening" })).toBeVisible();

  // T1: a plain step. Its candidate is below the priority bar, so Shadow stays quiet.
  await openTicket(page, "T1");
  voice.say("T1 just wants the invoice, so I resend it.");
  await typeReply(page, "Here is your invoice.");
  await act(page, "Reply");
  await page.waitForTimeout(5000);
  expect(asks()).toHaveLength(0);
  await page.clock.fastForward(15_000);

  // T2: refund, then keep working the ticket (clicking through the message and the customer
  // card) through the moment the candidate arrives: no question while the expert is busy.
  await openTicket(page, "T2");
  voice.say("Charged twice, 49 euros. A clear duplicate, I refund it.");
  await act(page, "Refund");
  const candidateFor = (ticketId: string) =>
    sessionMsgs(received).some(
      (m) =>
        m.type === "candidate_question" &&
        (m.question as { aboutTicketId?: string }).aboutTicketId === ticketId,
    );
  for (let i = 0; i < 16; i++) {
    // ~7 s of clicks; the candidate arrives ~3 s after the commit.
    if (i % 2) await page.getByRole("complementary", { name: "Customer" }).click();
    else await page.getByRole("region", { name: "Message" }).click();
    await page.waitForTimeout(400);
  }
  expect(candidateFor("T2"), "the T2 candidate arrived while the expert was busy").toBe(true);
  expect(asks()).toHaveLength(0);
  await expect.poll(() => asks().length, { timeout: 15_000 }).toBe(1);
  voice.say("Only if the second charge is still pending, then it drops off by itself.");
  await page.clock.fastForward(20_000);

  // T3: hold, then go off the record before the candidate arrives: nothing is asked off the record.
  await openTicket(page, "T3");
  voice.say("There's an open chargeback here, so I don't refund.");
  await act(page, "Hold / request info");
  await page.keyboard.press("Alt+KeyO");
  await expect(page.getByText("You are off the record.")).toBeVisible();
  await page.waitForTimeout(7000);
  expect(candidateFor("T3"), "the T3 candidate arrived off the record").toBe(true);
  expect(asks()).toHaveLength(1);
  await page
    .getByRole("toolbar", { name: "Recording controls" })
    .getByRole("button", { name: "Back on the record" })
    .click();
  await expect.poll(() => asks().length, { timeout: 15_000 }).toBe(2);
  voice.say("Never refund while a chargeback is open, the bank decides.");
  await page.clock.fastForward(25_000);

  // T4: the account-takeover guardrail.
  await openTicket(page, "T4");
  voice.say("The email changed right before the refund request. That smells like takeover.");
  await act(page, "Handoff: Security");
  await expect.poll(() => asks().length, { timeout: 15_000 }).toBe(3);
  voice.say("Any sign of takeover goes to Security, never a refund.");
  await page.waitForTimeout(2500);

  // Requirement 1: ≥ 3 live questions, each at a natural pause, about the on-screen ticket,
  // at least one about a guardrail.
  const out = sessionMsgs(sent);
  const candidates = new Map<string, { slot: string; aboutTicketId?: string; text: string }>();
  for (const m of sessionMsgs(received)) {
    if (m.type !== "candidate_question") continue;
    const q = m.question as { id: string; slot: string; aboutTicketId?: string; text: string };
    candidates.set(q.id, q);
  }
  const asked = out
    .filter((m) => m.type === "question_asked")
    .map((m) => ({ questionId: String(m.questionId), tMs: Number(m.tMs) }));
  expect(asked.length).toBeGreaterThanOrEqual(3);
  expect(asks().map((a) => a.body)).toEqual(asked.map((a) => candidates.get(a.questionId)?.text));
  const deskEvents = out
    .filter((m) => m.type === "desk_event")
    .map((m) => m.event as { type: string; tMs: number; ticketId?: string });
  const activity = deskEvents.filter((e) => e.type === "input_activity").map((e) => e.tMs);
  const speech = out
    .filter((m) => m.type === "transcript" && m.speaker === "expert")
    .map((m) => Number(m.tStartMs));
  const offRecord = out
    .filter((m) => m.type === "off_record")
    .map((m) => ({ on: m.on === true, tMs: Number(m.tMs) }));
  for (const a of asked) {
    const lastBefore = (ts: number[]) =>
      Math.max(Number.NEGATIVE_INFINITY, ...ts.filter((t) => t <= a.tMs));
    expect(a.tMs - lastBefore(activity), `no typing before ${a.questionId}`).toBeGreaterThanOrEqual(
      INPUT_IDLE_MS,
    );
    expect(a.tMs - lastBefore(speech), `silence before ${a.questionId}`).toBeGreaterThanOrEqual(
      SILENCE_MS,
    );
    expect(offRecord.filter((o) => o.tMs <= a.tMs).at(-1)?.on ?? false).toBe(false);
    const onScreen = deskEvents.filter((e) => e.type === "ticket_opened" && e.tMs <= a.tMs).at(-1);
    expect(candidates.get(a.questionId)?.aboutTicketId).toBe(onScreen?.ticketId);
  }
  expect(asked.some((a) => candidates.get(a.questionId)?.slot === "guardrail")).toBe(true);

  // ---------------------------------------------------------------- Debrief
  await page.getByRole("button", { name: "Stop" }).click();
  const debriefList = page.getByRole("list", { name: "Debrief questions" });
  await expect(debriefList).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => voice.controls.some((c) => c.prefix === "[DEBRIEF]")).toBe(true);
  const debrief = voice.controls.find((c) => c.prefix === "[DEBRIEF]");
  const followUps = (JSON.parse(debrief?.body ?? "{}") as { questions: { text: string }[] })
    .questions;
  // Requirement 2a: ≥ 3 follow-ups, none of them already answered live.
  expect(followUps.length).toBeGreaterThanOrEqual(3);
  const liveTexts = new Set(asks().map((a) => a.body));
  for (const q of followUps) expect(liveTexts.has(q.text)).toBe(false);
  await expect(debriefList.getByRole("listitem")).toHaveCount(followUps.length);

  const answers = [
    "Above 100 euros I ask Billing to sign off first.",
    "A known bug still gets refunded, and I tell Engineering.",
    "The Security on-call picks it up, through the security handoff queue.",
  ];
  for (const [i, answer] of answers.entries()) {
    await expect(debriefList.getByRole("listitem").nth(i)).toHaveAttribute("aria-current", "step");
    await page.getByLabel("Your answer").fill(answer);
    await page.getByRole("button", { name: "Send answer" }).click();
  }

  // Requirement 2b: a teach-back the expert confirms, by voice as in the demo.
  await expect.poll(() => voice.controls.some((c) => c.prefix === "[TEACHBACK]")).toBe(true);
  await page.waitForTimeout(500);
  voice.say("Yes, that's right.");
  // Then the prediction check on cases Shadow has not seen: the expert marks each one right.
  const predictions = page.getByRole("region", { name: "Prediction check" });
  await expect(predictions).toBeVisible();
  const groups = predictions.getByRole("group", { name: /^Is prediction \d+ right\?$/ });
  await expect(groups.first()).toBeVisible();
  const count = await groups.count();
  for (let i = 0; i < count; i++) {
    await groups.nth(i).getByRole("button", { name: "Right", exact: true }).click();
  }
  const confirmed = page.getByText(/Confirmed at/);
  await expect(confirmed).toBeVisible();
  const saved = await request.get(`${API_URL}/workmaps/${fixtureMap.id}`);
  expect(saved.ok()).toBe(true);
  const map = WorkMap.parse(await saved.json());
  expect(map.teachBackConfirmedAtMs).not.toBeNull();

  // ---------------------------------------------------------------- Work Map
  // Requirement 3: every step and guardrail links to a screen moment and a verbatim quote.
  await page.getByRole("link", { name: "Open the Work Map" }).click();
  await expect(page).toHaveURL(new RegExp(`/map/${map.id}\\?session=`));
  const detail = page.getByRole("region", { name: "Step detail" });
  for (const step of map.steps) {
    await page
      .getByRole("list", { name: "Steps" })
      .getByRole("button", { name: new RegExp(escapeRe(step.title)) })
      .click();
    const article = detail.getByRole("article", { name: `Step ${step.order}: ${step.title}` });
    await expect(article).toBeVisible();
    const evidence = article.getByRole("region", { name: "Evidence" });
    await expect(evidence.getByText(`“${step.reason.text}”`)).toBeVisible();
    await expect(evidence.getByText(mmss(step.reason.tMs)).first()).toBeVisible();
    await expect(article.getByText(mmss(step.moment.tMs)).first()).toBeVisible();
    await expect(evidence.getByLabel(/^Session clip /)).toBeVisible();
  }
  const guardrailList = page.getByRole("list", { name: "Guardrail list" });
  for (const g of map.guardrails) {
    const item = guardrailList.locator(`[data-guardrail-id="${g.id}"]`);
    const toggle = item.getByRole("button", { expanded: false }).first();
    await toggle.click();
    await expect(item.getByText(g.evidence.quote.text, { exact: false }).first()).toBeVisible();
    await expect(item.getByText(mmss(g.evidence.quote.tMs)).first()).toBeVisible();
    await expect(item.getByLabel(/^Session clip /)).toBeVisible();
    await item.getByRole("button", { expanded: true }).first().click();
  }

  // ---------------------------------------------------------------- Teach
  // Requirement 4: on an unseen ticket the tutor holds the wrong save before it is committed
  // and explains with the expert's own reasoning.
  await page.goto("/teach");
  await page.getByRole("button", { name: "Start voice tutor" }).click();
  await expect(page.getByRole("button", { name: "Stop voice tutor" })).toBeVisible();
  await openTicket(page, "N1");
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const paused = page.getByRole("status").filter({ hasText: "Paused by Shadow" });
  await expect(paused).toBeVisible();
  await expect(paused).toContainText("G4");
  const g4 = map.guardrails.find((g) => g.id === "G4");
  if (!g4) throw new Error("map has no G4");
  const intervention = page.getByRole("region", { name: "Shadow intervention" });
  await expect(intervention).toContainText(`${map.expertName} would stop here. Why do you think?`);
  await expect(intervention).toContainText(g4.evidence.quote.text);
  await expect.poll(() => voice.controls.some((c) => c.prefix === "[INTERVENE]")).toBe(true);
  const intervene = voice.controls.find((c) => c.prefix === "[INTERVENE]");
  expect(JSON.parse(intervene?.body ?? "{}")).toMatchObject({ ticketId: "N1" });
  expect(intervene?.body).toContain(JSON.stringify(g4.evidence.quote.text).slice(1, -1));
  await expect(page.getByText(/^Committed:/)).toHaveCount(0);
  expect(committedActions(sent)).not.toContainEqual({ ticketId: "N1", outcome: "refund" });

  // N2 (GDPR, also unseen) is a judgment point: Shadow asks the learner to predict first.
  await openTicket(page, "N2");
  await expect(page.getByRole("region", { name: "Predict the decision" })).toBeVisible();
  await expect.poll(() => voice.controls.some((c) => c.prefix === "[PREDICT]")).toBe(true);
  expect(committedActions(sent)).not.toContainEqual({ ticketId: "N1", outcome: "refund" });

  expect(errors).toEqual([]);
});
