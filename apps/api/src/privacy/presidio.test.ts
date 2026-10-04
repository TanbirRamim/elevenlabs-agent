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

  it("keeps ticket ids and dates the analyzer flags; still redacts names", async () => {
    // Live analyzer output for this sentence: "T3" as US_DRIVER_LICENSE (0.3), "this month"
    // as DATE_TIME and "T4"-style ids as LOCATION would erase the quotes the Work Map cites.
    const text = "T3: Dario was charged twice this month";
    const analyzed = [
      { entity_type: "US_DRIVER_LICENSE", start: 0, end: 2, score: 0.3 },
      { entity_type: "PERSON", start: 4, end: 9, score: 0.85 },
      { entity_type: "DATE_TIME", start: 28, end: 38, score: 0.85 },
    ];
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(url).endsWith("/analyze")) return jsonResponse(analyzed);
      // Anonymize exactly the spans it is sent, like the real service.
      const body = JSON.parse(String(init?.body)) as {
        text: string;
        analyzer_results: { entity_type: string; start: number; end: number }[];
      };
      let out = body.text;
      for (const r of [...body.analyzer_results].sort((a, b) => b.start - a.start)) {
        out = `${out.slice(0, r.start)}<${r.entity_type}>${out.slice(r.end)}`;
      }
      return jsonResponse({ text: out });
    }) as typeof fetch;
    const redact = createPresidioRedactor({ ...urls, fetchImpl, allowList: ["T3", "T4"] });
    expect(await redact(text)).toBe("T3: <PERSON> was charged twice this month");
  });

  it("waits out a slow (cold) analyzer instead of storing the placeholder", async () => {
    // Live: the first segments of a session timed out at 2.5 s while OCR loaded the host.
    const slow = vi.fn(
      (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(jsonResponse([])), 2700);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          });
        }),
    ) as unknown as typeof fetch;
    const redact = createPresidioRedactor({ ...urls, fetchImpl: slow });
    expect(await redact("nothing sensitive here")).toBe("nothing sensitive here");
  }, 10_000);
});
