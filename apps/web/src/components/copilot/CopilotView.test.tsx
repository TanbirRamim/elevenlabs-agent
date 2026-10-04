// @vitest-environment jsdom

import type { AgentExport, CopilotRun, MachineRule } from "@shadow/schema";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createApiClient, type FetchLike } from "../../lib/api";
import { CopilotView, FRAMING } from "./CopilotView";

afterEach(cleanup);

const API = "http://api.test";

const run: CopilotRun = {
  workMapId: "wm_test",
  version: 2,
  workflow: "Support escalation triage",
  expertName: "Maya",
  judge: "unavailable",
  policy: "default action, then rules",
  tickets: [
    {
      ticketId: "H6",
      subject: "Refund",
      proposed: "refund",
      decision: "handoff_billing_disputes",
      verdict: "BLOCK",
      source: "machine_rule",
      citedGuardrailIds: ["G2"],
      expected: "handoff_billing_disputes",
      expectedGuardrailIds: ["G2"],
      agrees: true,
      handedToHuman: true,
      handoffReason: "blocked",
    },
    {
      ticketId: "H9",
      subject: "Where is my order",
      proposed: "reply",
      decision: "reply",
      verdict: "ALLOW",
      source: "machine_rule",
      citedGuardrailIds: [],
      expected: "hold_request_info",
      expectedGuardrailIds: [],
      agrees: false,
      handedToHuman: false,
      handoffReason: null,
    },
  ],
  agreement: { agreed: 1, total: 2, rate: 0.5 },
  handedToHuman: 1,
};

const chargeback: MachineRule = {
  when: { anyTag: ["chargeback-open"] },
  effect: "BLOCK",
  expectedOutcome: "handoff_billing_disputes",
};
const exported: AgentExport = {
  workMapId: "wm_test",
  version: 2,
  workflow: "Support escalation triage",
  expertName: "Maya",
  systemPrompt: "You are the triage copilot.",
  rules: {
    machine: [{ id: "G2", machineRule: chargeback }],
    guardrails: [
      {
        id: "G2",
        type: "never",
        condition: "open chargeback",
        action: "route",
        quote: "Never refund with an open chargeback.",
        machineRule: chargeback,
      },
    ],
  },
};

function clientFor(routes: Record<string, { status: number; body: unknown }>) {
  const fetch: FetchLike = async (url) => {
    const hit = routes[url];
    if (!hit) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(hit.body), { status: hit.status });
  };
  return createApiClient({ baseUrl: API, fetch });
}

describe("CopilotView", () => {
  it("runs the published map and renders decisions, rules, labels and agreement", async () => {
    const client = clientFor({
      [`${API}/copilot/run`]: { status: 200, body: run },
      [`${API}/workmaps/published/export?format=agent`]: { status: 200, body: exported },
    });
    render(<CopilotView mapId={null} apiUrl={API} client={client} />);

    expect(screen.getByText(FRAMING)).toBeTruthy();
    expect(await screen.findByText("50%")).toBeTruthy();
    expect(screen.getByText("1 of 2 held-out tickets")).toBeTruthy();

    const table = screen.getByRole("table");
    const blocked = within(table).getByRole("row", { name: /H6/ });
    // Decision and label agree, so the outcome appears in both cells.
    expect(within(blocked).getAllByText("Hand off to Billing disputes")).toHaveLength(2);
    expect(within(blocked).getByText("instead of refund")).toBeTruthy();
    // Cited by the Copilot and named in the expert's label.
    expect(within(blocked).getAllByText("G2")).toHaveLength(2);
    expect(within(blocked).getByText("Agrees")).toBeTruthy();
    expect(within(blocked).getByText("a rule blocks the default")).toBeTruthy();

    const differs = within(table).getByRole("row", { name: /H9/ });
    expect(within(differs).getByText("Differs")).toBeTruthy();
    expect(within(differs).getByText("None applies")).toBeTruthy();
    expect(within(differs).getByText("No, Copilot decides")).toBeTruthy();
    expect(screen.getByText(/no language-model key is configured/)).toBeTruthy();
  });

  it("says plainly when no map is published", async () => {
    const notFound = { status: 404, body: { code: "unknown_workmap" } };
    const client = clientFor({
      [`${API}/copilot/run`]: notFound,
      [`${API}/workmaps/published/export?format=agent`]: notFound,
    });
    render(<CopilotView mapId={null} apiUrl={API} client={client} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No Work Map is published yet");
  });

  it("says plainly when the API is unreachable", async () => {
    render(<CopilotView mapId="wm_test" apiUrl={API} client={clientFor({})} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(`The API at ${API} did not answer`);
  });
});
