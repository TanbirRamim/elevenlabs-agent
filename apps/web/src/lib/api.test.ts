import type { PendingAction } from "@shadow/schema";
import { describe, expect, it, vi } from "vitest";
import { ApiClientError, createApiClient, type FetchLike } from "./api";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const verdict = {
  decision: "BLOCK",
  ruleIds: ["g1"],
  expectedOutcome: "handoff_security",
  source: "machine_rule",
};

const ticket: PendingAction["ticket"] = {
  id: "T3",
  subject: "Refund request",
  body: "Please refund my order",
  customer: {
    name: "Ann",
    email: "ann@example.com",
    plan: "monthly",
    vip: false,
    accountAgeDays: 40,
  },
  tags: ["refund"],
  amountEur: 120,
};

function clientWith(impl: FetchLike) {
  const fetchMock = vi.fn(impl);
  return { client: createApiClient({ baseUrl: "http://api.test/", fetch: fetchMock }), fetchMock };
}

describe("api client", () => {
  it("parses a valid response and sends a validated JSON body", async () => {
    const { client, fetchMock } = clientWith(async () =>
      jsonResponse(200, { id: "s1", mode: "capture" }),
    );
    await expect(client.createSession({ mode: "capture" })).resolves.toEqual({
      id: "s1",
      mode: "capture",
    });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("http://api.test/sessions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ mode: "capture" });
  });

  it("throws ApiClientError with the status and the ApiError body on 400", async () => {
    const { client } = clientWith(async () =>
      jsonResponse(400, { code: "invalid_action", message: "outcome missing" }),
    );
    const err = await client.getTickets("expert").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (!(err instanceof ApiClientError)) throw new Error("unreachable");
    expect(err.kind).toBe("http");
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_action");
    expect(err.body).toEqual({ code: "invalid_action", message: "outcome missing" });
  });

  it("throws ApiClientError without a body when the error response is not an ApiError", async () => {
    const { client } = clientWith(async () => new Response("nope", { status: 502 }));
    const err = await client.getPublishedWorkMap().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (!(err instanceof ApiClientError)) throw new Error("unreachable");
    expect(err.status).toBe(502);
    expect(err.body).toBeUndefined();
  });

  it("rejects a 2xx body that does not match the schema", async () => {
    const { client } = clientWith(async () =>
      jsonResponse(200, { decision: "MAYBE", ruleIds: [], source: "machine_rule" }),
    );
    const err = await client
      .preSave({ ticket, outcome: "refund", amountEur: 120 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (!(err instanceof ApiClientError)) throw new Error("unreachable");
    expect(err.kind).toBe("invalid_response");
    expect(err.status).toBe(200);
    expect(err.issues?.length).toBeGreaterThan(0);
  });

  it("rejects a 2xx body that is not JSON", async () => {
    const { client } = clientWith(async () => new Response("<html>", { status: 200 }));
    const err = await client.getMastery("s1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (!(err instanceof ApiClientError)) throw new Error("unreachable");
    expect(err.kind).toBe("invalid_response");
  });

  it("wraps a network failure", async () => {
    const { client } = clientWith(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await client.endSession("s1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    if (!(err instanceof ApiClientError)) throw new Error("unreachable");
    expect(err.kind).toBe("network");
    expect(err.status).toBe(0);
  });

  it("posts a pending action to /guard/presave and returns the verdict", async () => {
    const { client, fetchMock } = clientWith(async () => jsonResponse(200, verdict));
    await expect(client.preSave({ ticket, outcome: "refund", amountEur: 120 })).resolves.toEqual(
      verdict,
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/guard/presave");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has("x-shadow-session")).toBe(false);
  });

  it("names the teach session in the x-shadow-session header, not the URL", async () => {
    const { client, fetchMock } = clientWith(async () => jsonResponse(200, verdict));
    await client.preSave({ ticket, outcome: "refund" }, "ses_abc");
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("http://api.test/guard/presave");
    expect(new Headers(init?.headers).get("x-shadow-session")).toBe("ses_abc");
  });

  it("builds query strings and encodes path segments", async () => {
    const { client, fetchMock } = clientWith(async () => jsonResponse(200, { tickets: [] }));
    await client.getTickets("new_hire");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/tickets?set=new_hire");
    expect(client.recordingUrl("a b/c")).toBe("http://api.test/sessions/a%20b%2Fc/recording");
  });

  it("returns markdown as text and treats a 204 upload as success", async () => {
    const md = clientWith(async () => new Response("# Map", { status: 200 }));
    await expect(md.client.getWorkMapMarkdown("w1")).resolves.toBe("# Map");

    const put = clientWith(async () => new Response(null, { status: 204 }));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/webm" });
    await expect(put.client.uploadRecording("s1", blob)).resolves.toBeUndefined();
    const call = put.fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("http://api.test/sessions/s1/recording");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({ "content-type": "video/webm" });
    expect(init?.body).toBe(blob);
  });

  it("rejects an invalid request body before calling fetch", async () => {
    const { client, fetchMock } = clientWith(async () => jsonResponse(200, {}));
    await expect(
      client.answerDebrief("s1", { questionId: "q1", segmentIds: [] }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
