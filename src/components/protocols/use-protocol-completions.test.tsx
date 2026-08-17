import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProtocolCompletions } from "./use-protocol-completions";

function jsonResponse<T>(body: T) {
  const json = vi.fn().mockResolvedValue(body);
  return {
    response: { ok: true, json } as unknown as Response,
    json,
  };
}

describe("useProtocolCompletions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let a stale initial fetch overwrite a completed toggle", async () => {
    let resolveInitialFetch!: (response: Response) => void;
    const initialFetch = new Promise<Response>((resolve) => {
      resolveInitialFetch = resolve;
    });
    const streakResponse = jsonResponse({
      current_streak: 0,
      longest_streak: 0,
      total_days: 0,
    });
    const toggleResponse = jsonResponse({ status: "completed" });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        return Promise.resolve(toggleResponse.response);
      }
      if (url.includes("type=streaks")) {
        return Promise.resolve(streakResponse.response);
      }
      return initialFetch;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useProtocolCompletions("protocol-1", true, true)
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.toggleToolCompletion("tool-1");
    });
    expect(result.current.completedToolIds.has("tool-1")).toBe(true);

    const staleResponse = jsonResponse({ completed_tool_ids: [] });
    resolveInitialFetch(staleResponse.response);
    await waitFor(() => expect(staleResponse.json).toHaveBeenCalled());

    expect(result.current.completedToolIds.has("tool-1")).toBe(true);
  });
});
