"use client";

import { ConversationProvider } from "@elevenlabs/react";
import type { ReactNode } from "react";

/**
 * Wraps a page in the ElevenLabs conversation context that `useVoice` needs.
 * Mount it once per page that talks to an agent (capture, teach), not in the root layout,
 * so pages without voice don't load the audio stack.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  return <ConversationProvider>{children}</ConversationProvider>;
}
