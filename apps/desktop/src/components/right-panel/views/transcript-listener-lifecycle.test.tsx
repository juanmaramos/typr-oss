// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  route: { sessionId: "session-1" as string | null },
  panel: {
    currentView: "chat",
    surface: "floating",
    isExpanded: false,
    floatingState: "expanded",
    openFloating: vi.fn(),
    switchView: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  toastLoading: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("sonner", () => ({ toast: { loading: mocks.toastLoading, success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@tanstack/react-router", () => ({
  useMatch: ({ from }: { from: string }) => from === "/app/note/$id"
    ? testState.route.sessionId ? { params: { id: testState.route.sessionId } } : undefined
    : undefined,
}));
vi.mock("@typr/plugin-windows", () => ({ getCurrentWebviewWindowLabel: () => "main" }));
vi.mock("@/contexts", () => ({ useRightPanel: () => testState.panel }));
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
vi.mock("@typr/ui/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/app-shell/transitions", () => ({ RESIZABLE_PANEL_TRANSITION: "" }));
vi.mock("@/components/projects/project-brief-sidebar-view", () => ({ ProjectBriefSidebarView: () => null }));
vi.mock("@/components/right-panel/views/chat-view", () => ({ ChatView: () => createElement("div", { "data-heavy-view": "chat" }) }));
vi.mock("@/components/right-panel/views/transcript-view", () => ({ TranscriptView: () => createElement("div", { "data-heavy-view": "transcript" }) }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/utils/telemetry", () => ({ captureTelemetryException: vi.fn() }));

import RightPanel from "@/components/right-panel";

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
      createElement(RightPanel, { panelGroupWidth: 1200 }),
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
    testState.route.sessionId = "session-1";
    Object.assign(testState.panel, {
      currentView: "chat",
      surface: "floating",
      isExpanded: false,
      floatingState: "expanded",
    });
    container = document.createElement("div");
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    activeListeners = new Set();
    unlistenCalls = [];
    mocks.listen.mockReset().mockImplementation(async (_name: string, callback: Listener) => {
      activeListeners.add(callback);
      const unlisten = vi.fn(() => activeListeners.delete(callback));
      unlistenCalls.push(unlisten);
      return unlisten;
    });
    mocks.toastLoading.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
  });

  afterEach(async () => {
    await unmount();
    queryClient.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    container.remove();
  });

  it("delivers one toast per matching native event while chat-only, floating-transcript, and collapsed", async () => {
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(1);
    const listener = [...activeListeners][0];
    expect(listener).toBeDefined();

    // The persistent RightPanel is hidden while floating ChatView owns the surface.
    expect(container.querySelector('[data-heavy-view="chat"]')).toBeNull();
    expect(container.querySelector('[data-heavy-view="transcript"]')).toBeNull();
    await fire(listener, "transcriptProcessing", "session-1");
    expect(mocks.toastLoading).toHaveBeenCalledTimes(1);

    // A floating TranscriptView is selected elsewhere; RightPanel still owns the
    // native notification listener even though neither sidebar view is mounted.
    testState.panel.currentView = "transcript";
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(1);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    await fire(listener, "transcriptUpdated", "session-1");
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ["session", "words", "session-1"] });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ["session", "session-1"] });

    testState.panel.floatingState = "collapsed";
    await render();
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(1);
    await fire(listener, "transcriptError", "session-1");
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("rebinds on note navigation and disposes callbacks after leaving the note route", async () => {
    await render();
    expect(activeListeners.size).toBe(1);
    const firstListener = [...activeListeners][0];

    testState.route.sessionId = "session-2";
    await render();
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

  it("unlistens when native registration resolves after route leave", async () => {
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
    expect(errorSpy).toHaveBeenCalledWith("[events] Failed to register transcript listener", failure);
  });
});
