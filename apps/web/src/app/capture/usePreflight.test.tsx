// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePreflight } from "./usePreflight";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubSignedUrl(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("usePreflight: voice agent check", () => {
  it("fails immediately with the server's reason on 503 eleven_not_configured", async () => {
    const fetchMock = stubSignedUrl(503, { code: "eleven_not_configured" });
    const { result } = renderHook(() => usePreflight({ deskReady: false }));

    expect(result.current.agent.status).toBe("pending");
    await waitFor(() => expect(result.current.agent.status).toBe("failed"));

    expect(result.current.agent.detail).toBe("Voice agent not configured on the server.");
    expect(result.current.agent.fixHint).toMatch(/ELEVENLABS_INTERVIEWER_AGENT_ID/);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/eleven/signed-url?agent=interviewer",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("names the status and code for any other failure", async () => {
    stubSignedUrl(502, { code: "eleven_upstream" });
    const { result } = renderHook(() => usePreflight({ deskReady: false }));

    await waitFor(() => expect(result.current.agent.status).toBe("failed"));
    expect(result.current.agent.detail).toBe(
      "The server could not open a voice session (502, eleven_upstream).",
    );
  });

  it("is ready when the server hands out a signed session", async () => {
    stubSignedUrl(200, { signedUrl: "wss://example.test/session" });
    const { result } = renderHook(() => usePreflight({ deskReady: false }));

    await waitFor(() => expect(result.current.agent.status).toBe("ok"));
    expect(result.current.agent.detail).toBe("Interviewer agent, signed session ready");
  });
});
