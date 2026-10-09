// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useMemo, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionId = "search-handoff-session";
const i18n = setupI18n({ locale: "en", messages: { en: {} } });

vi.mock("@typr/ui/components/ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
      createElement("button", props, children),
  };
});
vi.mock("@typr/ui/components/ui/input", async () => {
  const { createElement } = await import("react");
  return {
    Input: (props: Record<string, unknown>) => createElement("input", props),
  };
});

import { DEFAULT_CHAT_VIEW_STATE, useChatState } from "@/stores/useChatState";
import { DEFAULT_TRANSCRIPT_VIEW_STATE, useTranscriptViewState } from "@/stores/useTranscriptViewState";
import { ChatSearchHeader } from "./chat-search-header";
import { SearchHeader } from "./search-header";

let root: Root;
let container: HTMLDivElement;
const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

function SearchHarness() {
  const viewState = useChatState((state) =>
    state.sessions[sessionId]?.viewState ?? DEFAULT_CHAT_VIEW_STATE);
  const setViewState = useChatState((state) => state.setViewState);

  return (
    <I18nProvider i18n={i18n}>
      {viewState.isSearchActive && (
        <ChatSearchHeader
          onClose={() => setViewState(sessionId, { isSearchActive: false })}
          messages={[{ isUser: true, content: "alpha beta alpha" }]}
          searchTerm={viewState.searchTerm}
          onSearchTermChange={(searchTerm) => setViewState(sessionId, { searchTerm })}
        />
      )}
      <div className="whitespace-pre-wrap">alpha beta alpha</div>
    </I18nProvider>
  );
}

const transcriptSessionId = "transcript-search-handoff-session";
const transcriptEditor = {
  commands: {
    setSearchTerm: vi.fn(),
    resetIndex: vi.fn(),
    setReplaceTerm: vi.fn(),
    nextSearchResult: vi.fn(),
    previousSearchResult: vi.fn(),
    replaceAll: vi.fn(),
  },
  storage: { searchAndReplace: { results: [{}, {}], resultIndex: 0 } },
  view: { dom: document.createElement("div") },
};

function TranscriptSearchHarness({ editorReady = true }: { editorReady?: boolean }) {
  const viewState = useTranscriptViewState((state) =>
    state.sessions[transcriptSessionId] ?? DEFAULT_TRANSCRIPT_VIEW_STATE);
  const setViewState = useTranscriptViewState((state) => state.setViewState);
  const editorRef = useRef<{ editor: typeof transcriptEditor } | null>(null);
  if (editorReady) {
    editorRef.current = { editor: transcriptEditor };
  }
  const target = useMemo(() => ({ type: "editor" as const, editorRef, ready: editorReady }), [editorReady]);

  return (
    <I18nProvider i18n={i18n}>
      <SearchHeader
        target={target}
        onClose={() => setViewState(transcriptSessionId, { isSearchActive: false })}
        searchTerm={viewState.searchTerm}
        onSearchTermChange={(searchTerm) => setViewState(transcriptSessionId, { searchTerm })}
        replaceTerm={viewState.replaceTerm}
        onReplaceTermChange={(replaceTerm) => setViewState(transcriptSessionId, { replaceTerm })}
        hasReplace
      />
    </I18nProvider>
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function waitForHighlights() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  });
}

describe("assistant search handoff", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useChatState.getState().clearSession(sessionId);
    useChatState.getState().setViewState(sessionId, { isSearchActive: true });
    useTranscriptViewState.getState().clearSession(transcriptSessionId);
    useTranscriptViewState.getState().setViewState(transcriptSessionId, { isSearchActive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (originalScrollIntoView) {
      Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      delete (window.HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    }
    useChatState.getState().clearSession(sessionId);
    useTranscriptViewState.getState().clearSession(transcriptSessionId);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores the query text and reapplies real message highlights after remount", async () => {
    await act(async () => { root.render(<SearchHarness />); });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, "alpha");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(useChatState.getState().getViewState(sessionId).searchTerm).toBe("alpha");
    expect(container.querySelectorAll(".search-highlight")).toHaveLength(2);

    act(() => root.render(null));
    expect(container.querySelectorAll(".search-highlight")).toHaveLength(0);

    await act(async () => { root.render(<SearchHarness />); });
    expect(container.querySelector("input")?.value).toBe("alpha");
    await waitForHighlights();

    expect(container.querySelectorAll(".search-highlight")).toHaveLength(2);
  });

  it("restores the transcript query and reapplies it to the editor after remount", async () => {
    transcriptEditor.commands.setSearchTerm.mockClear();

    await act(async () => { root.render(<TranscriptSearchHarness />); });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, "speaker");
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(useTranscriptViewState.getState().getViewState(transcriptSessionId).searchTerm).toBe("speaker");
    expect(transcriptEditor.commands.setSearchTerm).toHaveBeenLastCalledWith("speaker");

    act(() => root.render(null));
    transcriptEditor.commands.setSearchTerm.mockClear();

    await act(async () => { root.render(<TranscriptSearchHarness />); });
    expect(container.querySelector("input")?.value).toBe("speaker");
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(transcriptEditor.commands.setSearchTerm).toHaveBeenCalledTimes(1);
    expect(transcriptEditor.commands.setSearchTerm).toHaveBeenCalledWith("speaker");
  });

  it("applies a restored transcript query when the editor becomes ready after SearchHeader mounts", async () => {
    useTranscriptViewState.getState().setViewState(transcriptSessionId, { searchTerm: "speaker" });
    transcriptEditor.commands.setSearchTerm.mockClear();

    await act(async () => { root.render(<TranscriptSearchHarness editorReady={false} />); });
    expect(container.querySelector("input")?.value).toBe("speaker");
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(transcriptEditor.commands.setSearchTerm).not.toHaveBeenCalled();

    await act(async () => { root.render(<TranscriptSearchHarness editorReady />); });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(transcriptEditor.commands.setSearchTerm).toHaveBeenCalledWith("speaker");
  });
});
