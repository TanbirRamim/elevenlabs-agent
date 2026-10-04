import { z } from "zod";

/** Stored instead of the raw text whenever redaction cannot be performed. */
export const REDACTION_UNAVAILABLE = "[redaction unavailable]";

export type RedactText = (text: string) => Promise<string>;

/** MOCK_AI mode: fixture text only, no PII, no Presidio calls (HAR-3 rule). */
export const identityRedactor: RedactText = async (text) => text;

/** Fail-safe default: anything not explicitly wired stores the placeholder, never raw text. */
export const unavailableRedactor: RedactText = async () => REDACTION_UNAVAILABLE;

const AnalyzerResults = z.array(
  z.object({
    entity_type: z.string(),
    start: z.number().int(),
    end: z.number().int(),
    score: z.number(),
  }),
);
const AnonymizeResponse = z.object({ text: z.string() });

// Presidio's email recognizer only trusts public-suffix TLDs, so the seed's
// "@example.test" addresses slip through it. This backstop catches them.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export interface PresidioDeps {
  analyzerUrl?: string | undefined;
  anonymizerUrl?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: { warn: (obj: object, msg: string) => void };
}

/**
 * redactText via Presidio: POST analyzer /analyze, then anonymizer /anonymize.
 * Any failure (missing URLs, network, non-200, bad JSON) stores the placeholder —
 * raw transcript text never reaches the store or an LLM route.
 */
export function createPresidioRedactor({
  analyzerUrl,
  anonymizerUrl,
  fetchImpl = fetch,
  timeoutMs = 2500,
  log,
}: PresidioDeps): RedactText {
  return async (text) => {
    if (!analyzerUrl || !anonymizerUrl) return REDACTION_UNAVAILABLE;
    try {
      const post = async (url: string, body: object) => {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
      };
      const results = AnalyzerResults.parse(
        await post(`${analyzerUrl}/analyze`, { text, language: "en" }),
      );
      let redacted = text;
      if (results.length > 0) {
        redacted = AnonymizeResponse.parse(
          await post(`${anonymizerUrl}/anonymize`, { text, analyzer_results: results }),
        ).text;
      }
      return redacted.replace(EMAIL_RE, "<EMAIL_ADDRESS>");
    } catch (err) {
      log?.warn({ err: err instanceof Error ? err.message : String(err) }, "redaction failed");
      return REDACTION_UNAVAILABLE;
    }
  };
}
