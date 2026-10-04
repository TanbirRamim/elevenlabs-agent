import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Env } from "../env.js";
import type { ObjectStorage, StorageGetResult } from "./types.js";

function errName(err: unknown): string {
  return err instanceof Error ? err.name : "";
}

/**
 * S3-compatible storage (RustFS locally, R2 in production) from S3_* env.
 * Creates the bucket at boot if missing. Returns null when S3 is not configured,
 * so callers degrade to 503 instead of crashing.
 */
export async function createS3Storage(
  env: Pick<Env, "S3_ENDPOINT" | "S3_BUCKET" | "S3_ACCESS_KEY" | "S3_SECRET_KEY">,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<ObjectStorage | null> {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const Bucket = env.S3_BUCKET;
  try {
    await client.send(new CreateBucketCommand({ Bucket }));
  } catch (err) {
    const name = errName(err);
    if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
      log?.warn({ err: String(err), bucket: Bucket }, "s3 unreachable, storage disabled");
      return null;
    }
  }
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key, rangeHeader): Promise<StorageGetResult> {
      try {
        const out = await client.send(
          new GetObjectCommand({
            Bucket,
            Key: key,
            ...(rangeHeader ? { Range: rangeHeader } : {}),
          }),
        );
        if (!out.Body) return { status: 404 };
        return {
          status: out.ContentRange ? 206 : 200,
          // StreamingBlobTypes is a Readable in the Node runtime.
          body: out.Body as unknown as NodeJS.ReadableStream,
          contentLength: out.ContentLength,
          contentRange: out.ContentRange,
        };
      } catch (err) {
        const name = errName(err);
        if (name === "NoSuchKey") return { status: 404 };
        if (name === "InvalidRange") return { status: 416 };
        throw err;
      }
    },
  };
}
