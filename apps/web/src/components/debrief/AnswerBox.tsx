"use client";

import { type FormEvent, useId, useState } from "react";

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
    <form onSubmit={submit} className="space-y-2">
      {voiceConnected && (
        <p className="text-xs text-neutral-500">
          Answer out loud; Shadow moves on when you are done. Or type below.
        </p>
      )}
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={busy}
        className="w-full rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          The answer could not be sent. Check the connection to the Shadow API and try again.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {spokenCount > 0 && (
          <button
            type="button"
            onClick={onSubmitSpoken}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-40 dark:border-neutral-700"
          >
            Use what I said ({spokenCount} {spokenCount === 1 ? "line" : "lines"})
          </button>
        )}
      </div>
    </form>
  );
}
