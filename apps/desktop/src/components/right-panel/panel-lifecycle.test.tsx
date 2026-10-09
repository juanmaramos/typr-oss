// @vitest-environment jsdom

import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  route: { noteSessionId: "note-a" as string | null, projectId: null as string | null },
  variant: "dock" as "dock" | "rail",
  counts: {
    chat: { mounts: 0, unmounts: 0 },
    transcript: { mounts: 0, unmounts: 0 },
    leftSidebar: { mounts: 0, unmounts: 0 },
  },
  leftSidebar: { isExpanded: true },
  panel: {
    currentView: "chat",
    surface: "floating",
    isExpanded: false,
    floatingState: "collapsed",
    activeChatGroupId: "group-a",
    newChatRequest: null,
    switchView: vi.fn(),
    getChatGroup: vi.fn(() => "group-a"),
    getChatDraft: vi.fn(() => ""),
    setChatDraft: vi.fn(),
    clearChatDraft: vi.fn(),
    clearChatState: vi.fn(),
    requestNewChat: vi.fn(() => 1),
    consumeNewChatRequest: vi.fn(),
    isNewChatPending: vi.fn(() => false),
    completeNewChat: vi.fn(),
    getPendingFloatingPrompt: vi.fn(() => null),
    consumeFloatingPrompt: vi.fn(),
    queueFloatingPrompt: vi.fn(),
    openFloating: vi.fn(),
    collapseFloating: vi.fn(),
    closeFloating: vi.fn(),
    showSidebar: vi.fn(),
  },
  db: {
    listChatGroups: vi.fn(async () => []),
    listChatMessages: vi.fn(async () => []),
  },
}));

vi.mock("@/contexts", () => ({
  useRightPanel: () => testState.panel,
  useLeftSidebar: () => testState.leftSidebar,
}));
vi.mock("@typr/plugin-windows", () => ({ getCurrentWebviewWindowLabel: () => "main" }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: testState.route.noteSessionId ? `/app/note/${testState.route.noteSessionId}` : "/app" }),
  useMatch: ({ from }: { from: string }) => {
    if (from === "/app/note/$id") {
      return testState.route.noteSessionId
        ? { params: { id: testState.route.noteSessionId } }
        : undefined;
    }
    if (from === "/app/projects/$projectId") {
      return testState.route.projectId ? { params: { projectId: testState.route.projectId } } : undefined;
    }
    return undefined;
  },
}));
vi.mock("@typr/plugin-db", () => ({ commands: testState.db }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@typr/utils/contexts", () => ({
  useSession: (sessionId: string, selector: (state: unknown) => unknown) =>
    selector({ session: { id: sessionId, title: `Title ${sessionId}`, words: [] } }),
  useOngoingSession: (selector: (state: unknown) => unknown) =>
    selector({
      sessionId: null,
      status: "inactive",
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
    }),
}));
vi.mock("@/stores/feature-flags", () => ({
  canSwitchFloatingVariant: false,
  useFeatureFlags: (selector: (state: unknown) => unknown) => selector({
    floatingVariant: testState.variant,
    toggleFloatingVariant: vi.fn(),
  }),
}));
vi.mock("@/stores/audio-upload", () => ({
  useAudioUploadStore: Object.assign(() => ({}), { getState: () => ({ isProcessing: () => false }) }),
}));
vi.mock("@/hooks/useRecordingTimer", () => ({ useRecordingTimer: () => ({ elapsedMinutes: 0 }) }));
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));
vi.mock("@lingui/react", async () => {
  const React = await import("react");
  return {
    useLingui: () => ({
      i18n: { _: (message: { message?: string } | string) => typeof message === "string" ? message : message.message ?? "" },
      _: (message: { message?: string } | string) => typeof message === "string" ? message : message.message ?? "",
      t: (parts: TemplateStringsArray, ...values: unknown[]) => parts.reduce((result, part, index) => result + part + (values[index] ?? ""), ""),
    }),
    Trans: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/utils/telemetry", () => ({ captureTelemetryException: vi.fn() }));
vi.mock("@/components/app-shell/transitions", () => ({
  RESIZABLE_PANEL_TRANSITION: "",
  FLOATING_DOCK_SURFACE_TRANSITION: "",
  CONTEXT_PANE_TRANSITION: "",
}));
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
  return { Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement("button", props, children) };
});
vi.mock("@typr/ui/components/ui/tooltip", async () => {
  const React = await import("react");
  return {
    Tooltip: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    TooltipTrigger: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    TooltipContent: () => null,
  };
});
vi.mock("@typr/ui/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/projects/project-brief-sidebar-view", () => ({ ProjectBriefSidebarView: () => null }));
vi.mock("@/lib/features", () => ({ FEATURES: { SHOW_PRIMARY_RAIL: false } }));
vi.mock("@/components/app-shell/use-shell-mode", () => ({ useShellMode: () => "notes" }));
vi.mock("@/components/left-sidebar", async () => {
  const React = await import("react");
  return {
    default: () => {
      React.useEffect(() => {
        testState.counts.leftSidebar.mounts += 1;
        return () => { testState.counts.leftSidebar.unmounts += 1; };
      }, []);
      return React.createElement("div", { "data-panel-child": "left-sidebar" });
    },
  };
});
vi.mock("@/components/left-sidebar/nav-user", () => ({ NavUser: () => null }));
vi.mock("@typr/ui/components/ui/card", async () => {
  const React = await import("react");
  const Card = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children);
  return { Card, CardDescription: Card, CardHeader: Card, CardTitle: Card };
});
vi.mock("@/components/ui/google-meet-waveform", () => ({ default: () => null }));
vi.mock("@/components/ui/icon", async () => {
  const React = await import("react");
  return { Icon: () => React.createElement("span") };
});
vi.mock("@/components/ui/model-selector", () => ({ ModelSelector: () => null }));
vi.mock("@/components/ui/prompt-input", async () => {
  const React = await import("react");
  const Wrapper = ({ children }: { children?: ReactNode }) => React.createElement("div", null, children);
  const Textarea = ({ onChange }: { onChange?: React.ChangeEventHandler<HTMLTextAreaElement> }) =>
    React.createElement("textarea", { onChange });
  return {
    PromptInput: Wrapper,
    PromptInputAction: Wrapper,
    PromptInputActions: Wrapper,
    PromptInputTextarea: Textarea,
  };
});
vi.mock("@/components/right-panel/views/chat-view", async () => {
  const React = await import("react");
  return {
    ChatView: () => {
      React.useEffect(() => {
        testState.counts.chat.mounts += 1;
        return () => { testState.counts.chat.unmounts += 1; };
      }, []);
      return React.createElement("div", { "data-panel-child": "chat" });
    },
  };
});
vi.mock("@/components/right-panel/views/transcript-view", async () => {
  const React = await import("react");
  return {
    TranscriptView: () => {
      React.useEffect(() => {
        testState.counts.transcript.mounts += 1;
        return () => { testState.counts.transcript.unmounts += 1; };
      }, []);
      return React.createElement("div", { "data-panel-child": "transcript" });
    },
  };
});
vi.mock("motion/react", async () => {
  const React = await import("react");
  return { motion: { div: React.forwardRef((props, ref) => React.createElement("div", { ...props, ref })) } };
});

import { FloatingMeetingAssistant } from "@/components/meeting-assistant/floating-assistant";
import { ContextPane } from "@/components/app-shell/context-pane";
import RightPanel from "@/components/right-panel";

function PanelHarness() {
  return createElement(
    "div",
    null,
    createElement(ContextPane),
    createElement(RightPanel, { panelGroupWidth: 1200 }),
    createElement(FloatingMeetingAssistant),
  );
}

describe("right panel and floating assistant lifecycle", () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;
  let queryClient: QueryClient | undefined;

  const active = (view: "chat" | "transcript" | "leftSidebar") =>
    testState.counts[view].mounts - testState.counts[view].unmounts;

  const render = async () => {
    await act(async () => {
      root?.render(createElement(QueryClientProvider, { client: queryClient! }, createElement(PanelHarness)));
    });
  };

  const waitForQueries = async () => {
    await vi.waitFor(() => expect(queryClient?.isFetching()).toBe(0));
  };

  beforeEach(() => {
    testState.route.noteSessionId = "note-a";
    testState.route.projectId = null;
    testState.variant = "dock";
    Object.assign(testState.panel, {
      currentView: "chat",
      surface: "floating",
      isExpanded: false,
      floatingState: "collapsed",
      activeChatGroupId: "group-a",
    });
    for (const view of ["chat", "transcript"] as const) {
      testState.counts[view].mounts = 0;
      testState.counts[view].unmounts = 0;
    }
    testState.counts.leftSidebar.mounts = 0;
    testState.counts.leftSidebar.unmounts = 0;
    testState.leftSidebar.isExpanded = true;
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    notifyManager.setNotifyFunction((callback) => { act(() => callback()); });
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    queryClient?.clear();
    notifyManager.setNotifyFunction((callback) => callback());
    container?.remove();
    root = undefined;
    queryClient = undefined;
    container = undefined;
  });

  it("measures retained sidebar tabs and floating shell remounts across the route and surface matrix", async () => {
    await render();
    await waitForQueries();

    expect(active("chat")).toBe(1);
    expect(active("transcript")).toBe(1);
    expect(active("leftSidebar")).toBe(1);

    testState.leftSidebar.isExpanded = false;
    await render();
    expect(active("leftSidebar")).toBe(1);
    expect(testState.counts.leftSidebar).toEqual({ mounts: 1, unmounts: 0 });
    testState.leftSidebar.isExpanded = true;
    await render();
    expect(active("leftSidebar")).toBe(1);

    Object.assign(testState.panel, { floatingState: "expanded", currentView: "chat" });
    await render();
    expect(active("chat")).toBe(2);
    expect(active("transcript")).toBe(1);

    testState.panel.currentView = "transcript";
    await render();
    expect(active("chat")).toBe(1);
    expect(active("transcript")).toBe(2);
    expect(testState.counts.chat).toEqual({ mounts: 2, unmounts: 1 });

    Object.assign(testState.panel, { surface: "sidebar", isExpanded: true, floatingState: "collapsed" });
    await render();
    expect(active("chat")).toBe(1);
    expect(active("transcript")).toBe(1);
    expect(testState.counts.transcript).toEqual({ mounts: 2, unmounts: 1 });

    testState.panel.isExpanded = false;
    await render();
    expect(active("chat")).toBe(1);
    expect(active("transcript")).toBe(1);

    testState.route.noteSessionId = "note-b";
    await render();
    expect(active("chat")).toBe(1);
    expect(active("transcript")).toBe(1);

    Object.assign(testState.panel, { surface: "floating", isExpanded: false, floatingState: "collapsed" });
    await render();
    Object.assign(testState.panel, { floatingState: "expanded", currentView: "chat" });
    await render();
    expect(active("chat")).toBe(2);
    expect(testState.counts.chat).toEqual({ mounts: 3, unmounts: 1 });

    testState.route.noteSessionId = null;
    await render();
    expect(active("chat")).toBe(0);
    expect(active("transcript")).toBe(0);
    expect(testState.counts.chat).toEqual({ mounts: 3, unmounts: 3 });
    expect(testState.counts.transcript).toEqual({ mounts: 2, unmounts: 2 });
  });

  it.each(["dock", "rail"] as const)("enables %s history reads only on the floating surface and keeps their cache", async (variant) => {
    testState.variant = variant;
    testState.panel.surface = "sidebar";
    testState.panel.isExpanded = true;

    await render();
    await waitForQueries();

    expect(testState.db.listChatGroups).not.toHaveBeenCalled();
    expect(testState.db.listChatMessages).not.toHaveBeenCalled();

    testState.panel.surface = "floating";
    await render();
    await waitForQueries();

    expect(testState.db.listChatGroups).toHaveBeenCalledTimes(1);
    expect(testState.db.listChatMessages).toHaveBeenCalledTimes(1);
    const historyKey = variant === "dock"
      ? ["dock-chat-history-summary", "note-a"]
      : ["floating-chat-history-summary", "note-a"];
    expect(queryClient?.getQueryData(historyKey)).toBe(false);

    testState.panel.surface = "sidebar";
    await render();
    expect(queryClient?.getQueryData(historyKey)).toBe(false);
    testState.panel.surface = "floating";
    await render();
    await waitForQueries();

    expect(testState.db.listChatGroups).toHaveBeenCalledTimes(1);
    expect(testState.db.listChatMessages).toHaveBeenCalledTimes(1);
    expect(queryClient?.getQueryData(historyKey)).toBe(false);
  });
});
