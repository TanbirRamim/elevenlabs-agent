import { toGray9x8 } from "./dhash";
import { type Frame, GRAY_COLS, GRAY_ROWS, type Rect } from "./types";

/** Browser-only: draws a video frame to a canvas and encodes it. No tests, only typecheck. */

export interface CaptureOptions {
  /** Crop in video pixel space. Defaults to the whole frame. */
  cropToRect?: Rect;
  /** Rects to fill black, in crop space (same scale as the crop, origin at the crop's corner). */
  blackout: Rect[];
  /** Output width cap; the crop is scaled down to this, never up. */
  maxWidth: number;
  /** JPEG quality 0..1. */
  quality: number;
}

export interface Scale {
  x: number;
  y: number;
}

/**
 * Factors that map viewport CSS pixels to video pixels for a tab/screen capture stream:
 * `videoWidth / viewport.width`. Returns null until the video knows its dimensions.
 * A hidden `<video>` has no useful clientWidth, so the viewport size is passed in
 * (defaults to window.innerWidth/innerHeight, which is what a current-tab capture shows).
 */
export function videoToViewportScale(
  video: HTMLVideoElement,
  viewport: { width: number; height: number } = {
    width: window.innerWidth,
    height: window.innerHeight,
  },
): Scale | null {
  if (!video.videoWidth || !video.videoHeight || viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }
  return { x: video.videoWidth / viewport.width, y: video.videoHeight / viewport.height };
}

/** Scale a rect by per-axis factors (e.g. a DOM rect into video pixel space). */
export function scaleRect(r: Rect, s: Scale): Rect {
  return { x: r.x * s.x, y: r.y * s.y, w: r.w * s.x, h: r.h * s.y };
}

let mainCanvas: HTMLCanvasElement | null = null;
let tinyCanvas: HTMLCanvasElement | null = null;

function canvas(
  slot: "main" | "tiny",
  width: number,
  height: number,
): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  let el = slot === "main" ? mainCanvas : tinyCanvas;
  if (!el) {
    el = document.createElement("canvas");
    if (slot === "main") mainCanvas = el;
    else tinyCanvas = el;
  }
  if (el.width !== width) el.width = width;
  if (el.height !== height) el.height = height;
  const ctx = el.getContext("2d", { willReadFrequently: slot === "tiny" });
  return ctx ? { el, ctx } : null;
}

function clampCrop(crop: Rect, vw: number, vh: number): Rect | null {
  const x = Math.max(0, Math.min(vw, crop.x));
  const y = Math.max(0, Math.min(vh, crop.y));
  const w = Math.min(vw - x, crop.x + crop.w - x);
  const h = Math.min(vh - y, crop.y + crop.h - y);
  return w >= 1 && h >= 1 ? { x, y, w, h } : null;
}

/**
 * Snapshot the current video frame: crop, scale to `maxWidth`, black out PII, JPEG-encode,
 * and compute the 9x8 gray downsample for dHash. Returns null if the video has no frame yet.
 */
export function captureFrame(video: HTMLVideoElement, opts: CaptureOptions): Frame | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const crop = clampCrop(opts.cropToRect ?? { x: 0, y: 0, w: vw, h: vh }, vw, vh);
  if (!crop) return null;

  const scale = Math.min(1, opts.maxWidth / crop.w);
  const width = Math.max(1, Math.round(crop.w * scale));
  const height = Math.max(1, Math.round(crop.h * scale));

  const main = canvas("main", width, height);
  if (!main) return null;
  try {
    main.ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  } catch {
    // The stream may not be decodable yet (e.g. right after track start).
    return null;
  }

  main.ctx.fillStyle = "#000";
  for (const r of opts.blackout) {
    // Pad by a pixel so anti-aliased edges never leak text.
    main.ctx.fillRect(
      Math.floor(r.x * scale) - 1,
      Math.floor(r.y * scale) - 1,
      Math.ceil(r.w * scale) + 2,
      Math.ceil(r.h * scale) + 2,
    );
  }

  const dataUrl = main.el.toDataURL("image/jpeg", opts.quality);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const jpegBase64 = dataUrl.slice(comma + 1);

  const tiny = canvas("tiny", GRAY_COLS, GRAY_ROWS);
  if (!tiny) return null;
  tiny.ctx.drawImage(main.el, 0, 0, GRAY_COLS, GRAY_ROWS);
  const { data } = tiny.ctx.getImageData(0, 0, GRAY_COLS, GRAY_ROWS);
  const gray = toGray9x8(data, GRAY_COLS, GRAY_ROWS);

  return { jpegBase64, width, height, gray };
}
