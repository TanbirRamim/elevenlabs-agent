"use client";

import type { CandidateQuestion } from "@shadow/schema";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_GATE,
  decide,
  type GateConfig,
  type GateDecision,
  type GateSignals,
} from "../turnGate";

export interface AskedQuestion {
  id: string;
  text: string;
  atMs: number;
  /** How long each signal had been quiet when the gate opened (the "why now" evidence). */
  pauseMs: { silence: number | null; inputIdle: number | null; screenIdle: number | null };
}

export interface TurnGateInputs {
  /** Run the gate only while true (voice connected, session started). */
  enabled: boolean;
  clock: () => number;
  lastUserSpeechMs: number | null;
  lastInputActivityMs: number | null;
  lastScreenChangeMs: number | null;
  agentSpeaking: boolean;
  offRecord: boolean;
  candidate: CandidateQuestion | null;
  /** Called once when the gate opens for a candidate. Must ask the question. */
  onOpen: (candidate: CandidateQuestion, asked: AskedQuestion) => void;
  config?: GateConfig;
  intervalMs?: number;
}

export interface TurnGateState {
  decision: GateDecision;
  signals: GateSignals;
  asked: AskedQuestion[];
}

const since = (now: number, t: number | null) => (t === null ? null : now - t);

/** The gate's view of the world at this instant. Pure. */
export function gateSignals(i: TurnGateInputs, asked: AskedQuestion[]): GateSignals {
  return {
    nowMs: i.clock(),
    lastUserSpeechMs: i.lastUserSpeechMs,
    lastInputActivityMs: i.lastInputActivityMs,
    lastScreenChangeMs: i.lastScreenChangeMs,
    agentSpeaking: i.agentSpeaking,
    offRecord: i.offRecord,
    questionsAskedMs: asked.map((q) => q.atMs),
    candidate: i.candidate
      ? { priority: i.candidate.priority, createdAtMs: i.candidate.createdAtMs }
      : null,
  };
}

/**
 * Evaluates the pure Turn Gate every 250 ms. The LLM decides how to ask; this decides when.
 * Inputs are read through a ref so the loop never restarts on re-render.
 */
export function useTurnGate(inputs: TurnGateInputs): TurnGateState {
  const ref = useRef(inputs);
  ref.current = inputs;
  const askedRef = useRef<AskedQuestion[]>([]);
  const lastAskedCandidate = useRef<string | null>(null);

  const [state, setState] = useState<TurnGateState>(() => {
    const signals = gateSignals(inputs, []);
    return { signals, decision: decide(signals, inputs.config ?? DEFAULT_GATE), asked: [] };
  });

  useEffect(() => {
    if (!inputs.enabled) return;
    const id = setInterval(() => {
      const i = ref.current;
      const signals = gateSignals(i, askedRef.current);
      const decision = decide(signals, i.config ?? DEFAULT_GATE);
      if (decision.open && i.candidate && lastAskedCandidate.current !== i.candidate.id) {
        lastAskedCandidate.current = i.candidate.id;
        const asked: AskedQuestion = {
          id: i.candidate.id,
          text: i.candidate.text,
          atMs: signals.nowMs,
          pauseMs: {
            silence: since(signals.nowMs, signals.lastUserSpeechMs),
            inputIdle: since(signals.nowMs, signals.lastInputActivityMs),
            screenIdle: since(signals.nowMs, signals.lastScreenChangeMs),
          },
        };
        askedRef.current = [...askedRef.current, asked];
        i.onOpen(i.candidate, asked);
      }
      setState({ signals, decision, asked: askedRef.current });
    }, inputs.intervalMs ?? 250);
    return () => clearInterval(id);
    // The loop reads everything through refs; only enabling/disabling restarts it.
  }, [inputs.enabled, inputs.intervalMs]);

  return state;
}
