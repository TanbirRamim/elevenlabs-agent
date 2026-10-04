// @vitest-environment jsdom
import { MasteryReport as MasteryReportSchema, WorkMap } from "@shadow/schema";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MasteryReport } from "./MasteryReport";

afterEach(cleanup);

const quote = (text: string, tMs: number) => ({
  text,
  segmentId: `seg-${tMs}`,
  tMs,
  speaker: "expert" as const,
  source: "think_aloud" as const,
});

const moment = (tMs: number, frameId: string) => ({
  tMs,
  frameId,
  clip: [tMs - 5_000, tMs + 5_000] as [number, number],
});

const workMap = WorkMap.parse({
  id: "wm-1",
  version: 1,
  workflow: "Refund escalations",
  expertName: "Dana",
  steps: [
    {
      id: "s1",
      order: 1,
      title: "Check account age before refunding",
      moment: moment(60_000, "f-60"),
      decision: "Open the account tab first",
      reason: quote("New accounts with a chargeback history go to Security, not refunds.", 61_000),
      guardrailIds: ["g1"],
      judgmentCall: true,
    },
    {
      id: "s2",
      order: 2,
      title: "Confirm the order id matches the invoice",
      moment: moment(120_000, "f-120"),
      decision: "Compare both ids",
      reason: quote("Half the fraud cases have a mismatched invoice.", 121_000),
      guardrailIds: [],
      judgmentCall: false,
    },
  ],
  guardrails: [
    {
      id: "g1",
      type: "stop_and_ask",
      condition: "the account is under 30 days old",
      action: "Route to Security",
      evidence: {
        quote: quote("Never refund a 30-day-old account on your own.", 62_000),
        moment: moment(62_000, "f-62"),
      },
    },
  ],
  openQuestions: [],
  offRecordSpans: [],
  coverage: 0.9,
  teachBackConfirmedAtMs: 900_000,
});

const report = MasteryReportSchema.parse({
  sessionId: "sess-1",
  workMapId: "wm-1",
  entries: [
    { stepOrGuardrailId: "s2", status: "independent", ticketId: "N1" },
    { stepOrGuardrailId: "s1", status: "assisted", ticketId: "N1" },
    { stepOrGuardrailId: "g1", status: "missed", ticketId: "N2" },
    { stepOrGuardrailId: "g1", status: "assisted", ticketId: "N3" },
  ],
  practiceNext: ["g1", "s1"],
});

describe("MasteryReport", () => {
  it("groups entries and counts them", () => {
    render(<MasteryReport report={report} workMap={workMap} />);
    expect(screen.getByTestId("count-independent").textContent).toBe("1");
    expect(screen.getByTestId("count-assisted").textContent).toBe("2");
    expect(screen.getByTestId("count-missed").textContent).toBe("1");

    const missed = screen.getByRole("region", { name: "Missed" });
    expect(
      within(missed).getByText("Route to Security when the account is under 30 days old"),
    ).toBeTruthy();
    expect(within(missed).getByText(/Guardrail · observed on N2/)).toBeTruthy();
  });

  it("lists practice-next titles and links to clips when a resolver is given", () => {
    render(
      <MasteryReport
        report={report}
        workMap={workMap}
        clipUrlFor={({ frameId }) => `/sessions/sess-0/recording#${frameId}`}
      />,
    );
    const practice = screen.getByRole("region", { name: "Practice next" });
    const items = within(practice).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("span")?.textContent)).toEqual([
      "Route to Security when the account is under 30 days old",
      "Check account age before refunding",
    ]);
    const links = within(practice).getAllByRole("link", { name: "Watch Dana's clip" });
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/sessions/sess-0/recording#f-62",
      "/sessions/sess-0/recording#f-60",
    ]);
  });

  it("shows empty-state copy when nothing was observed", () => {
    const empty = MasteryReportSchema.parse({
      sessionId: "sess-2",
      workMapId: "wm-1",
      entries: [],
      practiceNext: [],
    });
    render(<MasteryReport report={empty} workMap={workMap} />);
    expect(screen.getAllByText("Nothing in this group.")).toHaveLength(3);
    expect(screen.getByText(/Nothing to practice/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
