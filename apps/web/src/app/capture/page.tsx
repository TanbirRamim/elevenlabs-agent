import type { Metadata } from "next";
import { VoiceProvider } from "@/lib/voice";
import { CaptureSession } from "./CaptureSession";

export const metadata: Metadata = { title: "Capture · Singoda AI" };

/**
 * No Singoda AI chrome here (the route is "naked" in the shell): the page IS the
 * standalone DeskSim ticketing app the expert works in, and Singoda AI is present
 * only as the floating dock. Work the queue as you always do and think aloud.
 */
export default function CapturePage() {
  return (
    <VoiceProvider>
      <CaptureSession />
    </VoiceProvider>
  );
}
