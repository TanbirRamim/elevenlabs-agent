import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDiskStorage } from "./disk.js";
import type { StorageGetResult } from "./types.js";

const BODY = Buffer.from("0123456789abcdef");

async function text(result: StorageGetResult): Promise<string> {
  if (result.status !== 200 && result.status !== 206) throw new Error(`status ${result.status}`);
  if (Buffer.isBuffer(result.body)) return result.body.toString("utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of result.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "shadow-disk-"));
  return { dir, storage: createDiskStorage(dir) };
}

describe("disk storage", () => {
  it("round-trips an object and streams it back whole", async () => {
    const { dir, storage } = setup();
    await storage.put("recordings/ses_a.webm", BODY, "video/webm");
    const res = await storage.get("recordings/ses_a.webm");
    expect(res).toMatchObject({ status: 200, contentLength: 16 });
    expect(await text(res)).toBe("0123456789abcdef");
    expect(readdirSync(join(dir, "recordings"))).toEqual(["ses_a.webm"]); // no temp file left
  });

  it("serves ranges with S3 semantics", async () => {
    const { storage } = setup();
    await storage.put("recordings/ses_a.webm", BODY, "video/webm");
    const mid = await storage.get("recordings/ses_a.webm", "bytes=4-7");
    expect(mid).toMatchObject({ status: 206, contentLength: 4, contentRange: "bytes 4-7/16" });
    expect(await text(mid)).toBe("4567");
    const tail = await storage.get("recordings/ses_a.webm", "bytes=-3");
    expect(await text(tail)).toBe("def");
    expect((await storage.get("recordings/ses_a.webm", "bytes=99-")).status).toBe(416);
  });

  it("404s a missing key and overwrites on put", async () => {
    const { storage } = setup();
    expect((await storage.get("recordings/none.webm")).status).toBe(404);
    await storage.put("k.json", Buffer.from("old"), "application/json");
    await storage.put("k.json", Buffer.from("new"), "application/json");
    expect(await text(await storage.get("k.json"))).toBe("new");
  });

  it.each(["../escape", "a/../../b", "/etc/passwd", "a//b", "a\\b", ".hidden", ""])(
    "rejects the unsafe key %j",
    async (key) => {
      const { storage } = setup();
      await expect(storage.put(key, BODY, "video/webm")).rejects.toThrow(/unsafe storage key/);
      await expect(storage.get(key)).rejects.toThrow(/unsafe storage key/);
    },
  );
});
