import { describe, expect, it } from "vitest";

import { shouldEmitTranscriptUpdate } from "./index";

describe("transcript editor update guard", () => {
  it("does not emit updates for programmatic content sync", () => {
    expect(
      shouldEmitTranscriptUpdate({
        isFocused: true,
        isProgrammaticUpdate: true,
      }),
    ).toBe(false);
  });

  it("does not emit updates while the editor is not focused", () => {
    expect(
      shouldEmitTranscriptUpdate({
        isFocused: false,
        isProgrammaticUpdate: false,
      }),
    ).toBe(false);
  });

  it("emits updates only for focused user edits", () => {
    expect(
      shouldEmitTranscriptUpdate({
        isFocused: true,
        isProgrammaticUpdate: false,
      }),
    ).toBe(true);
  });
});
