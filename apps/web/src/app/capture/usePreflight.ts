"use client";

import { useCallback, useEffect, useState } from "react";
import type { PreflightStatus } from "@/components/recording";
import { VoiceAccess } from "@/lib/voice/access";

/** One check's state, in the recording kit's terms plus what to show for it. */
export interface CheckState {
  status: PreflightStatus;
  detail: string;
  fixHint?: string;
  /** The check is waiting for the expert (a permission prompt), not for the machine. */
  needsAction?: boolean;
}

const MIC_PENDING: CheckState = { status: "pending", detail: "Checking permission…" };
const AGENT_PENDING: CheckState = { status: "pending", detail: "Asking the server for a session…" };
const REDACTION_PENDING: CheckState = { status: "pending", detail: "Waiting for the desk…" };

async function micLabel(): Promise<string | null> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const input = devices.find((d) => d.kind === "audioinput" && d.label);
    return input?.label ?? null;
  } catch {
    return null;
  }
}

function micFromPermission(state: PermissionState, label: string | null): CheckState {
  if (state === "granted") return { status: "ok", detail: label ?? "Microphone allowed" };
  if (state === "denied")
    return {
      status: "failed",
      detail: "The browser blocks the microphone for this site.",
      fixHint:
        "Open the site settings (the icon left of the address bar), allow the microphone, then select Check again.",
    };
  return {
    status: "pending",
    detail: "Not allowed yet. Allow it now so the session starts without a prompt.",
    needsAction: true,
  };
}

/**
 * The checks before a capture session: microphone permission, the voice agent (via the same
 * `/api/eleven/signed-url` the session uses) and in-browser redaction. Screen sharing is
 * owned by the page because it needs the stream itself.
 */
export function usePreflight({ deskReady }: { deskReady: boolean }) {
  const [mic, setMic] = useState<CheckState>(MIC_PENDING);
  const [agent, setAgent] = useState<CheckState>(AGENT_PENDING);
  const [redaction, setRedaction] = useState<CheckState>(REDACTION_PENDING);
  const [round, setRound] = useState(0);

  // Microphone: read the permission without prompting, and follow changes made in site settings.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` re-runs the check on "Check again"
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const update = async (state: PermissionState) => {
      const label = state === "granted" ? await micLabel() : null;
      if (!cancelled) setMic(micFromPermission(state, label));
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMic({
          status: "failed",
          detail: "This browser has no microphone access here.",
          fixHint: "Open the app on localhost or HTTPS in a current Chrome, Edge or Safari.",
        });
        return;
      }
      try {
        status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) return;
        status.onchange = () => {
          if (status) void update(status.state);
        };
        await update(status.state);
      } catch {
        // No Permissions API for the microphone (e.g. Firefox): the prompt is the only way to know.
        if (!cancelled) setMic(micFromPermission("prompt", null));
      }
    })();
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [round]);

  const requestMic = useCallback(async () => {
    setMic({ status: "pending", detail: "Waiting for your answer in the browser prompt…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const label = stream.getAudioTracks()[0]?.label ?? null;
      for (const t of stream.getTracks()) t.stop();
      setMic({ status: "ok", detail: label || "Microphone allowed" });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setMic(
        name === "NotFoundError"
          ? {
              status: "failed",
              detail: "No microphone was found.",
              fixHint: "Connect a microphone or headset, then select Check again.",
            }
          : micFromPermission("denied", null),
      );
    }
  }, []);

  // Voice agent: the server has to be able to hand out a session for the interviewer agent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` re-runs the check on "Check again"
  useEffect(() => {
    let cancelled = false;
    setAgent(AGENT_PENDING);
    (async () => {
      let res: Response;
      try {
        res = await fetch("/api/eleven/signed-url?agent=interviewer", { cache: "no-store" });
      } catch {
        if (!cancelled)
          setAgent({
            status: "failed",
            detail: "Could not reach /api/eleven/signed-url.",
            fixHint: "Check that the web app is running, then select Check again.",
          });
        return;
      }
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: unknown };
        const code = typeof body.code === "string" ? body.code : null;
        if (cancelled) return;
        setAgent(
          code === "eleven_not_configured"
            ? {
                status: "failed",
                detail: "Voice is not configured on the server.",
                fixHint:
                  "Set ELEVENLABS_INTERVIEWER_AGENT_ID (see .env.example) and restart the web app. Without voice, Singoda AI follows silently and you type the debrief.",
              }
            : {
                status: "failed",
                detail: `The server could not open a voice session (${res.status}${code ? `, ${code}` : ""}).`,
                fixHint:
                  "Without voice, Singoda AI follows silently and you type the debrief. Select Check again to retry.",
              },
        );
        return;
      }
      const access = VoiceAccess.safeParse(await res.json().catch(() => null));
      if (cancelled) return;
      setAgent(
        access.success
          ? {
              status: "ok",
              detail:
                "signedUrl" in access.data
                  ? "Interviewer agent, signed session ready"
                  : "Interviewer agent, public agent id",
            }
          : {
              status: "failed",
              detail: "The server answered with an unexpected voice session.",
              fixHint: "Select Check again; if it persists, check the web app's logs.",
            },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [round]);

  // Redaction: the recorder only ever sees a canvas with personal data blacked out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` re-runs the check on "Check again"
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const supported =
      typeof MediaRecorder !== "undefined" &&
      typeof canvas.captureStream === "function" &&
      canvas.getContext("2d") !== null;
    if (!supported) {
      setRedaction({
        status: "failed",
        detail: "This browser cannot record a redacted canvas, so nothing would be recorded.",
        fixHint: "Use a current Chrome or Edge.",
      });
      return;
    }
    setRedaction(
      deskReady
        ? {
            status: "ok",
            detail:
              "Personal data on the desk is blacked out in this browser before frames or video leave it.",
          }
        : REDACTION_PENDING,
    );
  }, [deskReady, round]);

  const recheck = useCallback(() => setRound((r) => r + 1), []);

  return { mic, agent, redaction, requestMic, recheck };
}
