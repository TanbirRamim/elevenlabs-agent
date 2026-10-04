/** Result of a (possibly ranged) object read, mirroring HTTP semantics. */
export type StorageGetResult =
  | {
      status: 200 | 206;
      body: NodeJS.ReadableStream | Buffer;
      contentLength?: number | undefined;
      contentRange?: string | undefined;
    }
  | { status: 404 }
  | { status: 416 };

/** Object storage port: S3/RustFS in dev+prod, in-memory in tests. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string, rangeHeader?: string): Promise<StorageGetResult>;
}
