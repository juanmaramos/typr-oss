// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TranscriptEditor, { type TranscriptEditorRef } from "./index";

let root: Root | null = null;
let container: HTMLDivElement;
const refs: Array<TranscriptEditorRef | null> = [];

describe("TranscriptEditor forwarded ref", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    refs.length = 0;
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("provides the editor instance to callback refs and clears it on unmount", async () => {
    const ref = (value: TranscriptEditorRef | null) => { refs.push(value); };

    await act(async () => {
      root?.render(<TranscriptEditor ref={ref} initialWords={null} c={() => <span />} />);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(refs.some((value) => value?.editor)).toBe(true);

    act(() => root?.unmount());
    root = null;
    expect(refs[refs.length - 1]).toBeNull();
  });
});
