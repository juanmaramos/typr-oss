// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  route: { sessionId: "session-1" as string | null },
  panel: {
    currentView: "transcript",
    surface: "sidebar",
    isExpanded: true,
    switchView: vi.fn(),
  },
  floatingExpanded: true,
  floatingCurrentView: "transcript",
}));

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  toastLoading: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  getSession: vi.fn(),
  upsertSession: vi.fn(),
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("sonner", () => ({
  toast: { loading: mocks.toastLoading, success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("@tanstack/react-router", () => ({
  useMatch: ({ from }: { from: string }) => from === "/app/note/$id" && testState.route.sessionId
    ? { params: { id: testState.route.sessionId } }
    : undefined,
}));
vi.mock("@typr/plugin-windows", () => ({ getCurrentWebviewWindowLabel: () => "main" }));
vi.mock("@typr/plugin-db", () => ({
  commands: { getSession: mocks.getSession, upsertSession: mocks.upsertSession },
}));
vi.mock("@typr/plugin-listener", () => ({
  events: { sessionEvent: { listen: vi.fn(async () => vi.fn()) } },
}));
vi.mock("@typr/utils/contexts", () => ({
  useOngoingSession: (selector: (state: object) => unknown) => selector({
    sessionId: null,
    start: vi.fn(),
    status: "inactive",
    loading: false,
  }),
}));
vi.mock("@/contexts", () => ({
  useRightPanel: () => testState.panel,
  useTypr: () => ({ userId: "user-1", thankYouSessionId: null }),
}));
vi.mock("@/contexts/audio-upload", () => ({ useAudioUpload: () => ({ openAudioUpload: vi.fn() }) }));
vi.mock("@/stores/audio-upload", () => ({
  useAudioUploadStore: (selector: (state: object) => unknown) =>
    selector({ progress: { status: "idle" } }),
}));
vi.mock("@/hooks/useRecordingTimer", () => ({
  useRecordingTimer: () => ({ remaining: 0, isWarning: false, isDanger: false, shouldShowTimer: false }),
}));
vi.mock("@/hooks/useModelState", () => ({ useModelState: () => ({ models: [] }) }));
vi.mock("../../transcript/hooks/useSTTModel", () => ({
  useSTTModel: () => ({ selectedLanguage: "en", handleLanguageChange: vi.fn(), isChanging: false }),
}));
vi.mock("@typr/plugin-connector", () => ({ commands: { getSttModel: vi.fn(async () => null) } }));
vi.mock("@typr/plugin-local-stt", () => ({ commands: { listSupportedModels: vi.fn(async () => []) } }));
vi.mock("@typr/tiptap/transcript", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        editor: null,
        getWords: () => [],
        setWords: vi.fn(),
        scrollToBottom: vi.fn(),
        appendWords: vi.fn(),
        toText: () => "",
      }));
      return React.createElement("div", { "data-transcript-editor": "" });
    }),
  };
});
vi.mock("../../transcript/actions/TranscriptActionBar", () => ({ TranscriptActionBar: () => null }));
vi.mock("../../transcript/actions/STTLanguageSelector", () => ({ STTLanguageSelector: () => null }));
vi.mock("@/components/ui/ai-setup-indicator", () => ({ AISetupIndicator: () => null }));
vi.mock("@/components/ui/animated-icon-display", () => ({
  AnimatedIconDisplay: () => null,
  BUTTON_VARIANTS: {},
  CONTENT_VARIANTS: {},
}));
vi.mock("@/components/ui/loader", () => ({ Loader: () => null }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/utils/telemetry", () => ({ captureTelemetryException: vi.fn() }));
vi.mock("@/components/app-shell/transitions", () => ({ RESIZABLE_PANEL_TRANSITION: "" }));
vi.mock("@/components/projects/project-brief-sidebar-view", () => ({ ProjectBriefSidebarView: () => null }));
vi.mock("@/components/right-panel/views/chat-view", () => ({ ChatView: () => null }));
vi.mock("@/components/right-panel/components/search", () => ({ SearchHeader: () => null }));
vi.mock("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@typr/ui/components/ui/resizable", async () => {
  const React = await import("react");
  const ResizablePanel = React.forwardRef((props: { children: ReactNode }, ref) => {
    React.useImperativeHandle(ref, () => ({ resize: vi.fn() }));
    return React.createElement("div", null, props.children);
  });
  return { ResizablePanel };
});
vi.mock("@typr/ui/components/ui/tabs", async () => {
  const React = await import("react");
  return { Tabs: ({ children }: { children: ReactNode }) => React.createElement("div", null, children) };
});
vi.mock("@typr/ui/components/ui/button", async () => {
  const React = await import("react");
  return {
    Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
      React.createElement("button", props, children),
  };
});
vi.mock("@typr/ui/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@typr/ui/components/ui/popover", async () => {
  const React = await import("react");
  const Wrapper = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return { Popover: Wrapper, PopoverContent: Wrapper, PopoverTrigger: Wrapper };
});
vi.mock("motion/react", async () => {
  const React = await import("react");
  const MotionElement = ({ children, initial: _initial, animate: _animate, whileHover: _whileHover, variants: _variants, ...props }: Record<string, unknown>) =>
    React.createElement("div", props, children as ReactNode);
  return { motion: { div: MotionElement, p: MotionElement } };
});

import RightPanel from "@/components/right-panel";
import { TranscriptView } from "./transcript-view";

const FloatingTranscriptView = TranscriptView as ComponentType<{ showTabs?: boolean; layout?: "sidebar" | "floating" }>;

type Listener = (event: { payload: { type: string; session_id: string } }) => void;
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

let root: Root | undefined;
let container: HTMLDivElement;
let queryClient: QueryClient;
let activeListeners: Set<Listener>;
let unlistenCalls: ReturnType<typeof vi.fn>[];

function view() {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      I18nProvider,
      { i18n },
      createElement(
        "div",
        null,
        createElement(RightPanel, { panelGroupWidth: 1200 }),
        createElement(
          "div",
          { "data-surface": "floating", hidden: !testState.floatingExpanded },
          testState.floatingExpanded && testState.floatingCurrentView === "transcript"
            ? createElement(FloatingTranscriptView, { showTabs: false, layout: "floating" })
            : null,
        ),
      ),
    ),
  );
}

async function render() {
  await act(async () => {
    root?.render(view());
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function unmount() {
  if (!root) return;
  await act(async () => root?.unmount());
  root = undefined;
}

async function fire(listener: Listener, type: string, sessionId: string) {
  await act(async () => {
    listener({ payload: { type, session_id: sessionId } });
    await Promise.resolve();
  });
}

describe("persistent RightPanel transcript session-event listener", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    testState.route.sessionId = "session-1";
    testState.floatingExpanded = true;
    testState.floatingCurrentView = "transcript";
    Object.assign(testState.panel, {
      currentView: "transcript",
      surface: "sidebar",
      isExpanded: true,
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
    activeListeners = new Set();
    unlistenCalls = [];
    mocks.getSession.mockReset().mockImplementation(async ({ id }: { id: string }) => ({
      id,
      words: [{ text: id, speaker: null, confidence: null, start_ms: null, end_ms: null }],
    }));
    mocks.upsertSession.mockReset().mockResolvedValue(undefined);
    mocks.listen.mockReset().mockImplementation(async (_name: string, callback: Listener) => {
      activeListeners.add(callback);
      const unlisten = vi.fn(() => activeListeners.delete(callback));
      unlistenCalls.push(unlisten);
      return unlisten;
    });
    mocks.toastLoading.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
    notifyManager.setNotifyFunction((callback) => { act(() => callback()); });
  });

  afterEach(async () => {
    await unmount();
    queryClient.clear();
    notifyManager.setNotifyFunction((callback) => callback());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    container.remove();
  });

  it("delivers one event notification across sidebar and floating transcript views", async () => {
    await render();
    await vi.waitFor(() => {
      expect(container.querySelectorAll("[data-transcript-editor]")).toHaveLength(2);
    });

    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(1);
    expect(container.querySelector('[data-surface="floating"]')).not.toHaveProperty("hidden", true);
    const listener = [...activeListeners][0];

    await fire(listener, "transcriptProcessing", "session-1");
    expect(mocks.toastLoading).toHaveBeenCalledTimes(1);

    testState.floatingCurrentView = "chat";
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("[data-transcript-editor]")).toHaveLength(1);

    testState.floatingCurrentView = "transcript";
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("[data-transcript-editor]")).toHaveLength(2);

    testState.panel.isExpanded = false;
    testState.floatingExpanded = false;
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(1);
    expect(container.querySelectorAll("[data-transcript-editor]")).toHaveLength(1);

    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    await fire(listener, "transcriptUpdated", "session-1");
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["session", "session-1"] });

    await fire(listener, "transcriptError", "session-1");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("rebinds on note navigation and ignores callbacks after leaving the note route", async () => {
    await render();
    await vi.waitFor(() => expect(container.querySelectorAll("[data-transcript-editor]")).toHaveLength(2));
    expect(activeListeners.size).toBe(1);
    const firstListener = [...activeListeners][0];

    testState.route.sessionId = "session-2";
    await render();
    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalledWith({ id: "session-2" }));
    expect(mocks.listen).toHaveBeenCalledTimes(2);
    expect(activeListeners.size).toBe(1);
    expect(unlistenCalls[0]).toHaveBeenCalledTimes(1);

    await fire(firstListener, "transcriptProcessing", "session-1");
    expect(mocks.toastLoading).not.toHaveBeenCalled();

    const secondListener = [...activeListeners][0];
    await fire(secondListener, "transcriptProcessing", "session-2");
    expect(mocks.toastLoading).toHaveBeenCalledTimes(1);

    testState.route.sessionId = null;
    await render();
    expect(activeListeners.size).toBe(0);
    expect(unlistenCalls[1]).toHaveBeenCalledTimes(1);
    await fire(secondListener, "transcriptUpdated", "session-2");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("unlistens when registration resolves after route leave", async () => {
    const registration = deferred<void>();
    const registeredListeners: Listener[] = [];
    const unlisten = vi.fn(() => {
      const listener = registeredListeners[0];
      if (listener) activeListeners.delete(listener);
    });
    mocks.listen.mockImplementation((_name: string, callback: Listener) => {
      registeredListeners.push(callback);
      return registration.promise.then(() => {
        activeListeners.add(callback);
        return unlisten;
      });
    });

    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);

    testState.route.sessionId = null;
    await render();
    await fire(registeredListeners[0], "transcriptProcessing", "session-1");
    expect(mocks.toastLoading).not.toHaveBeenCalled();

    await act(async () => {
      registration.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);
  });

  it("handles native registration failures", async () => {
    const failure = new Error("listen failed");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listen.mockRejectedValue(failure);

    await render();
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("[events] Failed to register transcript listener", failure);
    });
    expect(mocks.listen).toHaveBeenCalledTimes(1);
  });
});
