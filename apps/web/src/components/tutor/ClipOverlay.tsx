"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { buttonClasses } from "@/components/ui";
import { formatClip } from "@/components/workmap/format";
import { recordingUrl } from "@/lib/api";
import type { MomentRef } from "./logic";

export interface ClipOverlayProps {
  frameId: string;
  /** Null when the Work Map has no moment for this frame. */
  moment: MomentRef | null;
  expertName: string;
  /** The expert's capture session; without it there is no recording to play. */
  expertSessionId: string | null;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/**
 * Plays the expert's clip around a step. Its own player instead of workmap/ClipPlayer because
 * the tutor's replay must start on its own (autoPlay); the recording has no audio track.
 *
 * A modal dialog: focus moves to Close on open, Tab stays inside, Escape closes, and focus goes
 * back to whatever opened it.
 */
export function ClipOverlay({
  frameId,
  moment,
  expertName,
  expertSessionId,
  onClose,
}: ClipOverlayProps) {
  const clip = moment?.moment.clip;
  const src =
    clip && expertSessionId
      ? `${recordingUrl(expertSessionId)}#t=${clip[0] / 1000},${clip[1] / 1000}`
      : null;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${expertName}'s moment`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
    >
      <div
        ref={panelRef}
        className="max-h-dvh w-full max-w-3xl overflow-y-auto rounded-t-panel border border-rule bg-surface text-ink shadow-raised sm:rounded-panel"
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-muted">
              <span>{expertName}'s moment</span>
              {clip ? (
                <span className="font-mono text-xs text-ink-faint tabular-nums">
                  {formatClip(clip)}
                </span>
              ) : null}
            </p>
            <h2 className="mt-1 font-display text-[1.375rem] leading-snug font-normal text-ink">
              {moment?.title ?? `Frame ${frameId}`}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <X aria-hidden="true" />
            Close
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {src && (
            <video
              key={src}
              src={src}
              autoPlay
              muted
              playsInline
              controls
              className="mb-5 block aspect-video w-full rounded-panel border border-rule bg-black"
            />
          )}
          {moment ? (
            <figure>
              <blockquote className="font-display text-[1.375rem] leading-snug text-pretty text-ink italic sm:text-[1.625rem]">
                “{moment.quote}”
              </blockquote>
              <figcaption className="mt-3 font-mono text-xs text-ink-muted">
                {expertName}
              </figcaption>
            </figure>
          ) : (
            <p className="text-[0.9375rem] text-ink-muted">
              The Work Map has no moment for frame{" "}
              <span className="font-mono text-[0.8125rem] text-ink">{frameId}</span>.
            </p>
          )}
          {moment && !expertSessionId && (
            <p className="mt-4 border-t border-rule pt-3 text-sm leading-relaxed text-ink-muted">
              The expert's recording isn't linked to this page (add{" "}
              <code className="font-mono text-[0.8125rem] text-ink">
                ?expertSession=&lt;capture session id&gt;
              </code>
              ), so only the quote is shown.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
