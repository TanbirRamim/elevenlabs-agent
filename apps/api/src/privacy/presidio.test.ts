import { describe, expect, it, vi } from "vitest";
import { createPresidioRedactor, REDACTION_UNAVAILABLE } from "./presidio.js";

const TEXT = "I emailed Ava Lindqvist at ava@example.test about the refund";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// Shaped like the live services respond (verified against the running containers).
function presidioFetch(): typeof fetch {
  return vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    if (String(url).endsWith("/analyze")) {
      return jsonResponse([{ entity_type: "PERSON", start: 10, end: 23, score: 0.85 }]);
    }
    return jsonResponse({
      text: "I emailed <PERSON> at ava@example.test about the refund",
    });
  }) as typeof fetch;
}

const urls = { analyzerUrl: "http://an", anonymizerUrl: "http://anon" };

describe("createPresidioRedactor", () => {
  it("redacts entities and backstops emails Presidio misses (.test TLD)", async () => {
    const redact = createPresidioRedactor({ ...urls, fetchImpl: presidioFetch() });
    const out = await redact(TEXT);
    expect(out).toBe("I emailed <PERSON> at <EMAIL_ADDRESS> about the refund");
    expect(out).not.toContain("ava@example.test");
    expect(out).not.toContain("Lindqvist");
  });

  it("stores the placeholder when Presidio is down, never the raw text", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const redact = createPresidioRedactor({ ...urls, fetchImpl: down });
    expect(await redact(TEXT)).toBe(REDACTION_UNAVAILABLE);
  });

  it("stores the placeholder on a non-200 response", async () => {
    const err500 = vi.fn(async () => new Response("boom", { status: 500 })) as typeof fetch;
    const redact = createPresidioRedactor({ ...urls, fetchImpl: err500 });
    expect(await redact(TEXT)).toBe(REDACTION_UNAVAILABLE);
  });

  it("stores the placeholder when the URLs are not configured", async () => {
    const redact = createPresidioRedactor({});
    expect(await redact(TEXT)).toBe(REDACTION_UNAVAILABLE);
  });

  it("skips the anonymizer when the analyzer finds nothing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([])) as typeof fetch;
    const redact = createPresidioRedactor({ ...urls, fetchImpl });
    expect(await redact("nothing sensitive here")).toBe("nothing sensitive here");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
