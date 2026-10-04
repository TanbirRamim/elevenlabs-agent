"use client";

import { Mic, Square } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/shell/Page";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  Select,
  StatusPill,
} from "@/components/ui";
import { useVoice, type VoiceAgent, VoiceProvider } from "@/lib/voice";

/**
 * Voice check: talk to an agent without the rest of the app. Used to verify the ElevenLabs
 * setup (TAN-0) and the control protocol (hidden [ASK] messages must not appear below).
 */
export default function VoiceCheckPage() {
  return (
    <VoiceProvider>
      <VoiceCheck />
    </VoiceProvider>
  );
}

function VoiceCheck() {
  const [agent, setAgent] = useState<VoiceAgent>("interviewer");
  const voice = useVoice({
    agent,
    dynamicVariables: { expert_name: "Maya", learner_name: "Jonas" },
  });
  const live = voice.status === "connected";

  return (
    <Page width="narrow">
      <PageHeader
        title="Voice check"
        description="Starts a conversation with one agent. Control messages are hidden from the transcript by design."
        meta={<Badge tone="muted">Tool</Badge>}
      />

      <Panel
        className="mt-6"
        title="Session"
        actions={<StatusChip status={voice.status} mode={voice.mode} />}
        footer={
          <>
            <span>Send while connected:</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!live}
              onClick={() => voice.sendScreen("ticket T3 opened; tag chargeback-open visible")}
            >
              Send screen context
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!live}
              onClick={() =>
                voice.sendControl("[ASK]", "You held the refund on T3 instead of paying it. Why?")
              }
            >
              Send [ASK]
            </Button>
            <Button size="sm" variant="ghost" disabled={!live} onClick={voice.markActivity}>
              Mark activity
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Field label="Agent">
              {(a11y) => (
                <Select
                  {...a11y}
                  value={agent}
                  disabled={live}
                  onChange={(e) => setAgent(e.target.value as VoiceAgent)}
                >
                  <option value="interviewer">Interviewer</option>
                  <option value="tutor">Tutor</option>
                </Select>
              )}
            </Field>
          </div>
          {live ? (
            <Button variant="secondary" icon={<Square />} onClick={voice.stop}>
              Stop
            </Button>
          ) : (
            <Button
              icon={<Mic />}
              loading={voice.status === "connecting"}
              onClick={() => void voice.start()}
            >
              {voice.status === "connecting" ? "Connecting…" : "Start"}
            </Button>
          )}
        </div>
        {voice.error ? (
          <Alert tone="danger" title="Voice error" className="mt-4">
            {voice.error}
          </Alert>
        ) : null}
      </Panel>

      <Panel
        className="mt-4"
        title="Transcript"
        meta={`Last user speech ${
          voice.lastUserSpeechMs === null ? "–" : `${(voice.lastUserSpeechMs / 1000).toFixed(1)} s`
        }`}
      >
        {voice.transcript.length === 0 ? (
          <EmptyState
            title="Nothing said yet"
            description="Start a session and speak; both sides of the conversation appear here."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {voice.transcript.map((line) => (
              <li key={line.id} className="grid grid-cols-[3.5rem_4rem_1fr] gap-2 text-ui">
                <span className="figures font-mono text-xs leading-5 text-ink-faint">
                  {(line.tMs / 1000).toFixed(1)}s
                </span>
                <span
                  className={
                    line.role === "agent" ? "font-medium text-ask-text" : "font-medium text-ink"
                  }
                >
                  {line.role === "agent" ? "Singoda AI" : "You"}
                </span>
                <span className="text-ink">{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </Page>
  );
}

function StatusChip({ status, mode }: { status: string; mode: string }) {
  if (status === "connected") {
    return (
      <StatusPill tone="ask" live>
        {mode === "speaking" ? "Singoda AI is speaking" : "Listening"}
      </StatusPill>
    );
  }
  if (status === "error") return <StatusPill tone="danger">Error</StatusPill>;
  if (status === "connecting") return <StatusPill tone="muted">Connecting</StatusPill>;
  return <StatusPill tone="muted">Not connected</StatusPill>;
}
