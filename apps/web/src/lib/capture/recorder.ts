/** Browser-only: screen picker and MediaRecorder wrapper. No tests beyond typecheck. */

export interface PickScreenOptions {
  /** Chrome hint to offer the current tab first. Ignored by other browsers. */
  preferCurrentTab?: boolean;
  frameRate?: number;
}

/**
 * `preferCurrentTab` is Chrome-only and not on lib.dom's DisplayMediaStreamOptions
 * (it is on MediaStreamConstraints), so widen the type here instead of casting at the call.
 */
type DisplayMediaOptions = DisplayMediaStreamOptions & { preferCurrentTab?: boolean };

/** Ask the user for a screen/tab. Falls back to the normal picker when the hint is unsupported. */
export function pickScreen(opts: PickScreenOptions = {}): Promise<MediaStream> {
  const { preferCurrentTab = true, frameRate = 5 } = opts;
  const constraints: DisplayMediaOptions = {
    video: { frameRate },
    audio: false,
    preferCurrentTab,
  };
  return navigator.mediaDevices.getDisplayMedia(constraints);
}

export interface RecorderOptions {
  mimeType?: string;
  bitsPerSecond?: number;
}

export interface Recorder {
  pause(): void;
  resume(): void;
  /** Stops recording and resolves with the whole session as one Blob. */
  stop(): Promise<Blob>;
  readonly state: RecordingState;
}

/** Record a stream (webm by default), collecting chunks until `stop()`. */
export function startRecorder(stream: MediaStream, opts: RecorderOptions = {}): Recorder {
  const mimeType = opts.mimeType ?? "video/webm";
  const options: MediaRecorderOptions = {
    bitsPerSecond: opts.bitsPerSecond ?? 1_000_000,
    ...(MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : {}),
  };
  const rec = new MediaRecorder(stream, options);
  const chunks: Blob[] = [];
  rec.ondataavailable = (ev: BlobEvent) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mimeType }));
    rec.onerror = (ev: Event) => reject(ev);
  });

  // Timeslice so a crash mid-session still leaves most of the recording in memory.
  rec.start(1000);

  return {
    get state() {
      return rec.state;
    },
    pause() {
      if (rec.state === "recording") rec.pause();
    },
    resume() {
      if (rec.state === "paused") rec.resume();
    },
    stop() {
      if (rec.state !== "inactive") rec.stop();
      return stopped;
    },
  };
}
