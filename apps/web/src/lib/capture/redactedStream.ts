import type { Rect } from "./types";

/** Where to draw a `src`-sized image inside `dst` so it fits without distortion (letterboxed). */
export function fitRect(src: { w: number; h: number }, dst: { w: number; h: number }): Rect {
  if (src.w <= 0 || src.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const s = Math.min(dst.w / src.w, dst.h / src.h);
  const w = src.w * s;
  const h = src.h * s;
  return { x: (dst.w - w) / 2, y: (dst.h - h) / 2, w, h };
}

/** Maps a rect from crop space into the fitted output area. */
export function toOutput(r: Rect, crop: { w: number; h: number }, fitted: Rect): Rect {
  const sx = fitted.w / crop.w;
  const sy = fitted.h / crop.h;
  return { x: fitted.x + r.x * sx, y: fitted.y + r.y * sy, w: r.w * sx, h: r.h * sy };
}

export interface RedactedRegion {
  /** Area of the shared video to record, in video pixels. */
  crop: Rect;
  /** Areas to black out, in crop space (same convention as captureFrame). */
  blackout: Rect[];
}

export interface RedactedStreamOptions {
  /** Output size; fixed for the whole recording so the webm stays playable. */
  width: number;
  height: number;
  fps?: number;
  /** Returns null when the region can't be determined; the output is then fully black (fail closed). */
  getRegion: () => RedactedRegion | null;
}

export interface RedactedStream {
  stream: MediaStream;
  stop(): void;
}

/** Padding around each blackout rect, in output pixels, so anti-aliased text edges stay hidden. */
const PAD = 2;

/**
 * A video stream of the shared tab with the same crop and PII blackout as the frames,
 * for MediaRecorder. The raw tab is never recorded, so the stored recording holds no
 * personal data that the frames don't also hide.
 */
export function startRedactedStream(
  video: HTMLVideoElement,
  opts: RedactedStreamOptions,
): RedactedStream | null {
  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fps = opts.fps ?? 5;

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const region = opts.getRegion();
    if (!region || region.crop.w < 1 || region.crop.h < 1 || !video.videoWidth) return;
    const out = fitRect(region.crop, { w: canvas.width, h: canvas.height });
    try {
      ctx.drawImage(
        video,
        region.crop.x,
        region.crop.y,
        region.crop.w,
        region.crop.h,
        out.x,
        out.y,
        out.w,
        out.h,
      );
    } catch {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    for (const r of region.blackout) {
      const o = toOutput(r, region.crop, out);
      ctx.fillRect(o.x - PAD, o.y - PAD, o.w + 2 * PAD, o.h + 2 * PAD);
    }
  };

  draw();
  const timer = setInterval(draw, Math.round(1000 / fps));
  const stream = canvas.captureStream(fps);
  return {
    stream,
    stop() {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
