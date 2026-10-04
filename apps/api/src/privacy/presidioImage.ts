/** Returns the redacted JPEG, or null when redaction is unavailable — the caller
 * must then drop the frame. Unredacted frames are never written anywhere. */
export type RedactImage = (jpeg: Buffer) => Promise<Buffer | null>;

export interface PresidioImageDeps {
  url?: string | undefined;
  fetchImpl?: typeof fetch;
  /** OCR takes seconds per frame; generous by design. */
  timeoutMs?: number;
  log?: { warn: (obj: object, msg: string) => void };
}

/** POST multipart `image` to the Presidio image redactor; raw JPEG bytes come back. */
export function createPresidioImageRedactor({
  url,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  log,
}: PresidioImageDeps): RedactImage {
  return async (jpeg) => {
    if (!url) return null;
    try {
      const form = new FormData();
      form.append("image", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "frame.jpg");
      const res = await fetchImpl(`${url}/redact`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`redactor -> ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      log?.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "image redaction failed",
      );
      return null;
    }
  };
}
