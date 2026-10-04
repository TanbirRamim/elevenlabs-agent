"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GateTimeline, type TimelineQuestion } from "../insight/GateTimeline";
import { REASON_SENTENCES } from "../insight/reasons";
import { AgentsStage } from "./AgentsStage";
import { CaptionBar } from "./CaptionBar";
import { CaptureStage } from "./CaptureStage";
import {
  captureAt,
  chapterAt,
  clockAt,
  mapAt,
  momentsOf,
  nextMoment,
  orbStateAt,
  previousMoment,
  snapToMoment,
  teachAt,
  transcriptAt,
} from "./frame";
import { MapStage } from "./MapStage";
import { PlayerControls } from "./PlayerControls";
import { getReplayScript } from "./script";
import { TeachStage } from "./TeachStage";

const SEEK_MS = 5_000;
/** Longest frame step; a tab coming back from the background does not jump ahead. */
const MAX_STEP_MS = 250;

/**
 * `/demo`: the whole product story as a 90-second, self-running replay. Autoplays without
 * sound (captions carry the voices); Space, ←/→, 1–4, Home and End drive it from the keyboard.
 *
 * With reduced motion it does not autoplay and renders in steps: each caption or state change
 * appears whole, with no typing, no orb motion and no transitions; ←/→ move between moments.
 */
export function DemoPlayer() {
  const script = getReplayScript();
  const moments = useMemo(() => momentsOf(script), [script]);
  const reduce = usePrefersReducedMotion();
  const [playMs, setPlayMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);
  const { durationMs } = script;

  const seek = useCallback(
    (ms: number) => setPlayMs(Math.min(durationMs, Math.max(0, ms))),
    [durationMs],
  );

  // Start: `?t=<seconds>` deep-links into the story; autoplay unless reduced motion is on.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(t) && t > 0) seek(t * 1000);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!query.matches) setPlaying(true);
  }, [seek]);

  // The clock. Paused tabs get no frames, and long gaps are capped.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min(MAX_STEP_MS, now - last);
      last = now;
      setPlayMs((p) => Math.min(durationMs, p + step));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);

  useEffect(() => {
    if (playing && playMs >= durationMs) setPlaying(false);
  }, [playing, playMs, durationMs]);

  const toggle = useCallback(() => {
    if (playMs >= durationMs) {
      setPlayMs(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [playMs, durationMs]);

  const restart = useCallback(() => {
    setPlayMs(0);
    setPlaying(true);
  }, []);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (reduce) {
        seek(
          direction === 1
            ? (nextMoment(moments, playMs) ?? durationMs)
            : previousMoment(moments, playMs),
        );
      } else {
        seek(playMs + direction * SEEK_MS);
      }
    },
    [reduce, moments, playMs, durationMs, seek],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (tag === "INPUT" && (target as HTMLInputElement).type !== "range") return;
      const onRange = tag === "INPUT";
      if (e.key === " " || e.key === "k") {
        // Space on a focused button or link activates it; everywhere else it plays or pauses.
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        toggle();
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !onRange) {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Home" && !onRange) {
        e.preventDefault();
        seek(0);
      } else if (e.key === "End" && !onRange) {
        e.preventDefault();
        seek(durationMs);
      } else if (/^[1-4]$/.test(e.key)) {
        const c = script.chapters[Number(e.key) - 1];
        if (c) seek(c.startMs);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, seek, durationMs, script.chapters]);

  // What is on screen. Reduced motion shows the replay in whole steps.
  const at = reduce ? snapToMoment(moments, playMs) : playMs;
  const chapter = chapterAt(script, at);
  const transcript = transcriptAt(script, at, reduce);
  const orb = orbStateAt(script, at);
  const clock = clockAt(script, at);

  const questions: TimelineQuestion[] = useMemo(
    () =>
      script.capture.asked.map((q) => ({
        id: q.id,
        atMs: q.atMs,
        text: q.text,
        slot: q.slot,
        ticketId: q.ticketId,
        pause: q.pause,
        readyAtMs: q.createdAtMs,
        heldBy: q.heldBy.map((r) => REASON_SENTENCES[r]),
      })),
    [script],
  );

  let stage: ReactNode;
  if (chapter.id === "capture") {
    const frame = captureAt(script, at);
    stage = (
      <CaptureStage
        frame={frame}
        timeline={
          <GateTimeline
            title="Why now"
            endMs={script.capture.durationMs}
            nowMs={frame.sessionMs}
            speech={script.capture.speech}
            typing={script.capture.input}
            screen={script.capture.screen}
            offRecord={script.capture.offRecord}
            asking={script.capture.agentSpeech}
            questions={questions}
            dropped={script.capture.dropped.map((d) => ({
              id: d.id,
              atMs: d.atMs,
              text: d.text,
              reason: d.reason,
              readyAtMs: d.createdAtMs,
            }))}
          />
        }
      />
    );
  } else if (chapter.id === "map") stage = <MapStage frame={mapAt(script, at)} />;
  else if (chapter.id === "teach")
    stage = <TeachStage frame={teachAt(script, at)} teach={script.teach} />;
  else stage = <AgentsStage />;

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-1 border-b border-rule pt-5 pb-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <h1 className="font-display text-[1.5rem] leading-tight font-normal tracking-[-0.01em] text-ink">
            Shadow, in 90 seconds
          </h1>
          <p className="text-sm text-ink-muted">
            Replay of a recorded session — try it live:{" "}
            <Link
              href="/capture"
              className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              Capture
            </Link>
            {", "}
            <Link
              href="/teach"
              className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              Teach
            </Link>
          </p>
        </div>

        <div className="pt-5 pb-10">
          <div className="grid gap-x-10 gap-y-5 lg:grid-cols-12">
            <section aria-labelledby="chapter-title" className="lg:col-span-4">
              <h2
                id="chapter-title"
                className="flex items-baseline gap-3 font-display text-[2rem] leading-none font-normal tracking-[-0.02em] text-ink sm:text-[2.5rem]"
              >
                <span className="font-mono text-sm tracking-normal text-ink-faint">
                  {String(chapter.number).padStart(2, "0")}
                </span>
                {chapter.title}
              </h2>
              <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-pretty text-ink-muted">
                {chapter.summary}
              </p>
            </section>
            <div className="border-t border-rule pt-5 lg:col-span-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
              <CaptionBar orb={orb} transcript={transcript} clock={clock} />
            </div>
          </div>

          <div className="mt-5 border-t border-rule pt-6">
            {reduce ? (
              stage
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={chapter.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                  }}
                  exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.7, 0, 0.84, 0] } }}
                >
                  {stage}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-30 border-t border-rule bg-canvas">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <PlayerControls
            playMs={playMs}
            durationMs={durationMs}
            playing={playing}
            chapters={script.chapters}
            current={chapterAt(script, playMs)}
            reducedMotion={reduce}
            onToggle={toggle}
            onRestart={restart}
            onSeek={seek}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Reduced-motion preference, read after hydration so the server and the first client render
 * agree, then kept in sync with the OS setting.
 */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}
