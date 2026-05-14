import { describe, expect, it } from "vitest";

import { shouldPersistTranscriptUpdate } from "./transcript-persistence";

describe("transcript persistence guard", () => {
  it("does not persist without a route session", () => {
    expect(
      shouldPersistTranscriptUpdate({
        isLive: false,
        routeSessionId: null,
        currentSessionId: null,
      }),
    ).toBe(false);
  });

  it("does not persist stale editor callbacks after route changes", () => {
    expect(
      shouldPersistTranscriptUpdate({
        isLive: false,
        routeSessionId: "note-a",
        currentSessionId: "note-b",
      }),
    ).toBe(false);
  });

  it("does not persist while live transcription owns the session", () => {
    expect(
      shouldPersistTranscriptUpdate({
        isLive: true,
        routeSessionId: "note-a",
        currentSessionId: "note-a",
      }),
    ).toBe(false);
  });

  it("persists inactive editor updates only for the current route session", () => {
    expect(
      shouldPersistTranscriptUpdate({
        isLive: false,
        routeSessionId: "note-a",
        currentSessionId: "note-a",
      }),
    ).toBe(true);
  });
});
