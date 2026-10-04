import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { CaptureSession } from "./CaptureSession";

export const metadata: Metadata = { title: "Capture · Shadow" };

export default function CapturePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Capture</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Triage the tickets the way you always do and think aloud. Shadow stays quiet while you work
        and asks short questions at natural pauses.
      </p>
      <VoiceProvider>
        <CaptureSession />
      </VoiceProvider>
    </main>
  );
}
