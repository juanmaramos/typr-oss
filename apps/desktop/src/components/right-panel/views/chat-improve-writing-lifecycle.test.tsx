// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  renderTemplate: vi.fn(),
  upsertChatMessage: vi.fn(),
  inputFocus: vi.fn(),
  panel: {
    currentView: "chat" as string,
    surface: "floating" as string,
    floatingState: "expanded" as string,
    switchView: vi.fn(),
    openFloating: vi.fn(),
  },
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@typr/ui", () => ({ ResponsiveIconButton: () => null }));
vi.mock("@typr/ui/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/ai-setup-indicator", () => ({ AISetupIndicator: () => null }));
vi.mock("@/components/ui/tab", () => ({ Tab: () => null }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/contexts", () => ({
  useTypr: () => ({ userId: "user-1" }),
  useRightPanel: () => ({
    isExpanded: false,
    chatInputRef: { current: { focus: mocks.inputFocus } },
    currentView: mocks.panel.currentView,
    surface: mocks.panel.surface,
    floatingState: mocks.panel.floatingState,
    switchView: (view: string) => {
      mocks.panel.switchView(view);
      mocks.panel.currentView = view;
    },
    openFloating: mocks.panel.openFloating,
    getChatGroup: () => "group-1",
    setChatGroup: vi.fn(),
    getPendingCreatedChatGroupId: vi.fn(() => null),
    setPendingCreatedChatGroupId: vi.fn(),
    getPendingFloatingPrompt: () => null,
    consumeFloatingPrompt: vi.fn(),
    getChatDraft: () => "",
    setChatDraft: vi.fn(),
    clearChatDraft: vi.fn(),
    clearChatState: vi.fn(),
    newChatRequest: null,
    requestNewChat: vi.fn(),
    consumeNewChatRequest: vi.fn(),
    isNewChatPending: () => false,
    completeNewChat: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTranscriptionActive", () => ({ useTranscriptionActive: () => ({ isRecordingActive: false }) }));
vi.mock("@/hooks/use-agent-writing-feature", () => ({ useAgentWritingFeature: () => false }));
vi.mock("../components/chat", () => ({
  ChatHistoryView: () => null,
  ChatInput: () => null,
  ChatMessagesView: () => null,
  EmptyChatState: () => null,
}));
vi.mock("../components/search", () => ({ ChatSearchHeader: () => null }));
vi.mock("@/hooks/useEditModeModelSwitch.tsx", () => ({ useEditModeModelSwitch: vi.fn() }));
vi.mock("../hooks/useActiveEntity", () => ({ useActiveEntity: () => ({ activeEntity: { id: "session-1", type: "note" }, sessionId: "session-1" }) }));
vi.mock("../hooks/useChatQueries", () => ({ useChatQueries: () => ({
  chatGroupsQuery: { data: [] },
  sessionData: { data: { title: "Test" } },
  getChatGroupId: vi.fn(async () => "group-1"),
  chatHistory: [],
  totalSessionMessagesQuery: { data: 0 },
}) }));
vi.mock("../utils/chat-utils", () => ({ focusInput: vi.fn(), formatDate: vi.fn() }));
vi.mock("@/stores/useSelectionContext", () => ({ useSelectionContext: () => ({
  selectedText: "words",
  selectionRange: { from: 1, to: 6 },
  sessionId: "session-1",
  clearSelection: vi.fn(),
}) }));
vi.mock("@typr/utils/contexts", () => ({ useSessions: (selector: (state: object) => unknown) => selector({ sessions: {} }) }));
vi.mock("@typr/utils", () => ({
  AUTO_CLOUD_MODEL_ID: "auto",
  AUTO_CLOUD_MODEL_PRIORITY: [],
  CLOUD_GENERATION_TOKEN_BUDGETS: { chatAnswer: 1000 },
  containsUrl: () => false,
  resolveCloudModelIdForCurrentOs: (value: string) => value,
  setEnableBrowserSearch: vi.fn(),
}));
vi.mock("@typr/utils/ai", () => ({
  generateText: mocks.generateText,
  modelProvider: vi.fn(async () => ({ languageModel: () => ({}) })),
  streamText: vi.fn(),
}));
vi.mock("@typr/plugin-connector", () => ({ commands: { getLlmConnection: vi.fn() } }));
vi.mock("@typr/plugin-db", () => ({ commands: { upsertChatMessage: mocks.upsertChatMessage } }));
vi.mock("@typr/plugin-local-llm", () => ({ commands: {} }));
vi.mock("@typr/plugin-misc", () => ({ commands: {} }));
vi.mock("@typr/plugin-template", () => ({ commands: { render: mocks.renderTemplate } }));
vi.mock("@/utils/inline-diff-preview", () => ({ showInlineDiffPreview: vi.fn() }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));

import { useChatState } from "@/stores/useChatState";
import type { TiptapEditor } from "@typr/tiptap/editor";
import { useAssistantEditorRequests } from "../hooks/useAssistantEditorRequests";
import { ChatView } from "./chat-view";

let root: Root;
let container: HTMLDivElement;

function RightPanelOwnerFixture() {
  useAssistantEditorRequests("session-1");
  const shouldMountChat = mocks.panel.surface === "floating"
    ? mocks.panel.floatingState === "expanded" && mocks.panel.currentView === "chat"
    : mocks.panel.currentView === "chat";

  return (
    <I18nProvider i18n={i18n}>
      {shouldMountChat && <ChatView layout={mocks.panel.surface === "floating" ? "floating" : "sidebar"} />}
    </I18nProvider>
  );
}

function views() {
  return <RightPanelOwnerFixture />;
}

async function sendImproveWritingEvent() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("improveWritingRequested", {
      detail: {
        selectedText: "words",
        range: { from: 1, to: 6 },
        sessionId: "session-1",
        action: "improve",
      },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("same-session improve-writing requests", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0));
      return 0;
    });
    container = document.createElement("div");
    root = createRoot(container);
    useChatState.getState().clearSession("session-1");
    window.__TYPR_EDITORS__ = {
      "session-1": {
        editor: { getHTML: () => "<p>original words</p>" } as unknown as TiptapEditor,
        setSuppressChangeHandling: vi.fn(),
      },
    };
    mocks.generateText.mockReset().mockResolvedValue({ text: "<p>improved words</p>" });
    mocks.renderTemplate.mockReset().mockImplementation(async (template: string) => template);
    mocks.upsertChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.panel.currentView = "chat";
    mocks.panel.surface = "floating";
    mocks.panel.floatingState = "expanded";
    mocks.panel.switchView.mockReset();
    mocks.panel.openFloating.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    useChatState.getState().clearSession("session-1");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts one AI edit and saves one user/result pair through the persistent request owner", async () => {
    await act(async () => { root.render(views()); });
    await sendImproveWritingEvent();

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const messages = useChatState.getState().getMessages("session-1");
    expect(messages).toHaveLength(2);
    expect(messages.filter((message) => message.isUser)).toHaveLength(1);
    expect(messages.filter((message) => !message.isUser)).toHaveLength(1);
    expect(mocks.upsertChatMessage).toHaveBeenCalledTimes(2);
  });

  it("does not start another edit while a session generation is already active", async () => {
    await act(async () => { root.render(views()); });
    act(() => useChatState.getState().setGenerating("session-1", true));

    await sendImproveWritingEvent();

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(useChatState.getState().getMessages("session-1")).toHaveLength(0);
  });

  it("accepts a later edit after the earlier one completes", async () => {
    await act(async () => { root.render(views()); });

    await sendImproveWritingEvent();
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
    await sendImproveWritingEvent();

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(useChatState.getState().getMessages("session-1")).toHaveLength(4);
    expect(mocks.upsertChatMessage).toHaveBeenCalledTimes(4);
  });

  it("queues a closed sidebar request and consumes it once when ChatView mounts", async () => {
    mocks.panel.currentView = "transcript";
    mocks.panel.surface = "sidebar";
    mocks.panel.floatingState = "collapsed";

    await act(async () => { root.render(<StrictMode><RightPanelOwnerFixture /></StrictMode>); });
    expect(container.querySelector("textarea")).toBeNull();

    await sendImproveWritingEvent();
    expect(mocks.panel.switchView).toHaveBeenCalledTimes(1);
    expect(mocks.panel.currentView).toBe("chat");
    expect(useChatState.getState().getViewState("session-1").pendingEditorAction).toMatchObject({
      type: "improve-writing",
      selectedText: "words",
      range: { from: 1, to: 6 },
    });

    await act(async () => { root.render(<StrictMode><RightPanelOwnerFixture /></StrictMode>); });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(useChatState.getState().getViewState("session-1").pendingEditorAction).toBeNull();
  });
});
