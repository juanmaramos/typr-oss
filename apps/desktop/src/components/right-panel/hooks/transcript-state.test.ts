import { describe, expect, it } from "vitest";

import { getSessionScopedPreviews, getSessionScopedWords } from "./transcript-state";

const word = (text: string) => ({
  text,
  speaker: null,
  confidence: null,
  start_ms: null,
  end_ms: null,
});

describe("transcript session ownership", () => {
  it("does not expose committed words from a previous note during a session switch render", () => {
    const state = {
      sessionId: "note-a",
      words: [word("stale")],
    };

    expect(getSessionScopedWords(state, "note-b")).toEqual([]);
  });

  it("exposes committed words only when the owner matches the current route session", () => {
    const words = [word("owned")];

    expect(getSessionScopedWords({ sessionId: "note-a", words }, "note-a")).toBe(words);
  });

  it("does not expose previews from a previous note during a session switch render", () => {
    const previews = { mic: [word("preview")] };

    expect(getSessionScopedPreviews({ sessionId: "note-a", wordsByChannel: previews }, "note-b")).toEqual({});
  });
});
