// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What `useVoice` passed to `useConversation` on its latest render. */
type HookProps = {
  onConnect?: () => void;
  micMuted?: boolean;
  volume?: number;
  onDisconnect?: (details: { reason: "user" | "agent" | "error"; message?: string }) => void;
};

const sdk = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  status: "disconnected" as string,
  startSession: vi.fn(),
  endSession: vi.fn(),
}));

vi.mock("@elevenlabs/react", () => ({
  useConversation: (props: Record<string, unknown>) => {
    sdk.props = props;
    return {
      status: sdk.status,
      mode: "listening",
      isSpeaking: false,
      startSession: sdk.startSession,
      endSession: sdk.endSession,
      sendUserMessage: vi.fn(),
      sendContextualUpdate: vi.fn(),
      sendUserActivity: vi.fn(),
    };
  },
}));

import { useVoice } from "./useVoice";

const props = () => sdk.props as HookProps;

function signedUrlResponse() {
  return new Response(JSON.stringify({ signedUrl: "wss://example.test/convai?token=t" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  sdk.status = "disconnected";
  sdk.startSession.mockReset();
  sdk.endSession.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => signedUrlResponse()),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useVoice holding (off the record, paused)", () => {
  it("mutes the microphone and silences the agent while held, and restores on resume", () => {
    const { rerender } = renderHook(({ hold }) => useVoice({ agent: "interviewer", hold }), {
      initialProps: { hold: false },
    });
    expect(props().micMuted).toBe(false);
    expect(props().volume).toBe(1);

    rerender({ hold: true });
    expect(props().micMuted).toBe(true);
    expect(props().volume).toBe(0);

    rerender({ hold: false });
    expect(props().micMuted).toBe(false);
    expect(props().volume).toBe(1);
  });

  it("keeps the expert's own mic mute separate from holding", () => {
    renderHook(() => useVoice({ agent: "interviewer", micMuted: true }));
    expect(props().micMuted).toBe(true);
    expect(props().volume).toBe(1);
  });
});

describe("useVoice end of call", () => {
  it("reports an agent hang-up once through onEnded", async () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() => useVoice({ agent: "interviewer", onEnded }));
    await act(async () => {
      await result.current.start();
    });
    act(() => props().onConnect?.());
    act(() => props().onDisconnect?.({ reason: "agent" }));
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith("agent", null);
  });

  it("reports a dropped connection as an error", async () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() => useVoice({ agent: "interviewer", onEnded }));
    await act(async () => {
      await result.current.start();
    });
    act(() => props().onConnect?.());
    act(() => props().onDisconnect?.({ reason: "error", message: "socket closed" }));
    expect(onEnded).toHaveBeenCalledWith("error", "socket closed");
  });

  it("treats a session that never connected as an error, not an ended call", async () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() => useVoice({ agent: "interviewer", onEnded }));
    await act(async () => {
      await result.current.start();
    });
    act(() => props().onDisconnect?.({ reason: "error", message: "mic denied" }));
    expect(onEnded).not.toHaveBeenCalled();
    expect(result.current.error).toBe("mic denied");
  });

  it("does not report the user's own stop as an unexpected end", async () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() => useVoice({ agent: "interviewer", onEnded }));
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());
    act(() => props().onDisconnect?.({ reason: "user" }));
    expect(sdk.endSession).toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("never starts a session when stop() lands while the signed URL is still loading", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const { result } = renderHook(() => useVoice({ agent: "interviewer" }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      release(signedUrlResponse());
      await pending;
    });
    expect(sdk.startSession).not.toHaveBeenCalled();
  });

  it("does not reconnect after the agent ends the call", async () => {
    const { result } = renderHook(() => useVoice({ agent: "interviewer", onEnded: vi.fn() }));
    await act(async () => {
      await result.current.start();
    });
    act(() => props().onConnect?.());
    act(() => props().onDisconnect?.({ reason: "agent" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(sdk.startSession).toHaveBeenCalledTimes(1);
  });

  it("ends the conversation when the page unmounts", async () => {
    const { result, unmount } = renderHook(() => useVoice({ agent: "tutor" }));
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(sdk.endSession).toHaveBeenCalled();
  });
});
