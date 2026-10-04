"use client";

import { type FormEvent, useId, useState } from "react";
import { Notice } from "../session/Notice";
import { Button } from "../ui";

export interface AnswerBoxProps {
  /** Label for the typed answer, e.g. "Type your answer". */
  label: string;
  submitLabel: string;
  /** Spoken lines collected so far; 0 hides the spoken-answer button. */
  spokenCount: number;
  busy: boolean;
  voiceConnected: boolean;
  onSubmitSpoken: () => void;
  /** Returns false when the typed answer could not be sent. */
  onSubmitTyped: (text: string) => boolean;
}

/**
 * The expert's answer: spoken (collected from the transcript) or typed, so the debrief works
 * without a live voice session.
 */
export function AnswerBox(props: AnswerBoxProps) {
  const { label, submitLabel, spokenCount, busy, voiceConnected, onSubmitSpoken, onSubmitTyped } =
    props;
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    const ok = onSubmitTyped(text);
    setFailed(!ok);
    if (ok) setText("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-ink">
          {label}
        </label>
        {voiceConnected && (
          <p className="text-sm text-ink-muted">
            Answer out loud; Shadow moves on when you are done. Or type below.
          </p>
        )}
      </div>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={busy}
        className="w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-2.5 text-[0.9375rem] leading-relaxed text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint disabled:opacity-60"
      />
      {failed && (
        <Notice role="alert">
          The answer could not be sent. Check the connection to the Shadow API and try again.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {spokenCount > 0 && (
          <Button variant="secondary" onClick={onSubmitSpoken} disabled={busy}>
            Use what I said ({spokenCount} {spokenCount === 1 ? "line" : "lines"})
          </Button>
        )}
      </div>
    </form>
  );
}
