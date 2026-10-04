"use client";

import { Mic, Send } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { Alert, Button, KbdCombo, Textarea } from "../ui";

/** Rendered only in the browser (the debrief starts after a session), so navigator is there. */
function modKey(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";
}

export interface AnswerBoxProps {
  /** Label for the typed answer, e.g. "Your answer". */
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
 * without a live voice session. ⌘/Ctrl Enter sends.
 */
export function AnswerBox(props: AnswerBoxProps) {
  const { label, submitLabel, spokenCount, busy, voiceConnected, onSubmitSpoken, onSubmitTyped } =
    props;
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const id = useId();
  const hintId = useId();

  const send = () => {
    if (!text.trim() || busy) return;
    const ok = onSubmitTyped(text);
    setFailed(!ok);
    if (ok) setText("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-ui font-medium text-ink">
          {label}
        </label>
        <p id={hintId} className="flex items-center gap-1.5 text-xs text-ink-muted">
          {voiceConnected ? (
            <>
              <Mic aria-hidden="true" className="size-3.5 shrink-0 stroke-[1.75] text-ask-text" />
              Answer out loud; Singoda AI moves on when you are done. Or type below.
            </>
          ) : (
            "Voice is not connected, so type your answer."
          )}
        </p>
      </div>
      <Textarea
        id={id}
        aria-describedby={hintId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        disabled={busy}
        className="resize-y"
      />
      {failed && (
        <Alert tone="danger" title="The answer could not be sent">
          Check the connection to the Singoda AI API and try again.
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={busy || !text.trim()}
          loading={busy}
          icon={<Send />}
          trailing={
            <span aria-hidden="true" className="hidden sm:inline-flex">
              <KbdCombo keys={[modKey(), "Enter"]} />
            </span>
          }
        >
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
