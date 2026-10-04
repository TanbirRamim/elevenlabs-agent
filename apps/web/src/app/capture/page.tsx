import type { Metadata } from "next";
import { Page } from "@/components/shell/Page";
import { PageHeader } from "@/components/ui";
import { VoiceProvider } from "@/lib/voice";
import { CaptureSession } from "./CaptureSession";

export const metadata: Metadata = { title: "Capture · Shadow" };

export default function CapturePage() {
  return (
    <Page width="wide">
      <PageHeader
        title="Capture"
        description="Work the queue as you always do and think aloud. Shadow follows quietly and asks short questions at natural pauses."
      />
      <VoiceProvider>
        <CaptureSession />
      </VoiceProvider>
    </Page>
  );
}
