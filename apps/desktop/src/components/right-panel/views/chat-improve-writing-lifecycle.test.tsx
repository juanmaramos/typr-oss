// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  renderTemplate: vi.fn(),
  upsertChatMessage: vi.fn(),
  inputFocus: vi.fn(),
  pendingFloatingPrompt: null as string | null,
  chatDraft: "",
  setChatDraft: vi.fn(),
  consumeFloatingPrompt: vi.fn(),
  getChatGroupId: vi.fn(),
  chatInputValue: "",
  chatInputSubmit: null as null | (() => unknown),
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
    currentView: "chat",
    surface: "floating",
    floatingState: "expanded",
    switchView: vi.fn(),
    openFloating: vi.fn(),
    getChatGroup: () => "group-1",
    setChatGroup: vi.fn(),
    getPendingFloatingPrompt: () => mocks.pendingFloatingPrompt,
    consumeFloatingPrompt: (sessionId: string) => {
      mocks.consumeFloatingPrompt(sessionId);
      mocks.pendingFloatingPrompt = null;
    },
    getChatDraft: () => mocks.chatDraft,
    setChatDraft: (sessionId: string, draft: string) => {
      mocks.setChatDraft(sessionId, draft);
      mocks.chatDraft = draft;
    },
    clearChatDraft: (sessionId: string) => {
      mocks.chatDraft = "";
    },
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
vi.mock("../components/chat", async () => {
  const React = await import("react");
  return {
    ChatHistoryView: () => null,
    ChatInput: ({ inputValue, onSubmit }: { inputValue: string; onSubmit: () => unknown }) => {
      mocks.chatInputValue = inputValue;
      mocks.chatInputSubmit = onSubmit;
      return React.createElement("textarea", { "data-testid": "chat-input", value: inputValue, readOnly: true });
    },
    ChatMessagesView: () => null,
    EmptyChatState: () => null,
  };
});
vi.mock("../components/search", () => ({ ChatSearchHeader: () => null }));
vi.mock("@/hooks/useEditModeModelSwitch.tsx", () => ({ useEditModeModelSwitch: vi.fn() }));
vi.mock("../hooks/useActiveEntity", () => ({ useActiveEntity: () => ({ activeEntity: { id: "session-1", type: "note" }, sessionId: "session-1" }) }));
vi.mock("../hooks/useChatQueries", () => ({ useChatQueries: () => ({
  chatGroupsQuery: { data: [] },
  sessionData: { data: { title: "Test" } },
  getChatGroupId: mocks.getChatGroupId,
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
import { abortChatGeneration, finishChatGeneration, hasActiveChatGeneration, startChatGeneration } from "../hooks/chat-generation";
import type { TiptapEditor } from "@typr/tiptap/editor";
import { ChatView } from "./chat-view";

let root: Root;
let container: HTMLDivElement;
let queuedPromptController: AbortController | null = null;
let releaseQueuedGroupId: ((groupId: string) => void) | null = null;

function views() {
  return (
    <I18nProvider i18n={i18n}>
      <>
        <ChatView layout="sidebar" />
        <ChatView layout="floating" />
      </>
    </I18nProvider>
  );
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
    mocks.getChatGroupId.mockReset().mockResolvedValue("group-1");
    mocks.pendingFloatingPrompt = null;
    mocks.chatDraft = "";
    mocks.setChatDraft.mockReset();
    mocks.consumeFloatingPrompt.mockReset();
    mocks.chatInputValue = "";
    mocks.chatInputSubmit = null;
    queuedPromptController = null;
    releaseQueuedGroupId = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    if (queuedPromptController) {
      abortChatGeneration("session-1");
      releaseQueuedGroupId?.("group-1");
      finishChatGeneration("session-1", queuedPromptController);
      queuedPromptController = null;
    }
    useChatState.getState().clearSession("session-1");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts one AI edit and saves one user/result pair when both surfaces receive the event", async () => {
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

  it("keeps a queued floating prompt as a draft while a New Chat claim is still active", async () => {
    const controller = startChatGeneration("session-1");
    queuedPromptController = controller;
    expect(controller).not.toBeNull();
    useChatState.getState().setGenerating("session-1", true);
    abortChatGeneration("session-1");
    useChatState.getState().clearSession("session-1");
    mocks.pendingFloatingPrompt = "  queued prompt  ";

    await act(async () => {
      root.render(
        <I18nProvider i18n={i18n}>
          <ChatView layout="floating" />
        </I18nProvider>,
      );
    });

    expect(mocks.consumeFloatingPrompt).toHaveBeenCalledWith("session-1");
    expect(mocks.setChatDraft).toHaveBeenCalledWith("session-1", "queued prompt");
    expect(mocks.chatInputValue).toBe("queued prompt");
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')?.value).toBe("queued prompt");
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.getChatGroupId).not.toHaveBeenCalled();
    expect(hasActiveChatGeneration("session-1")).toBe(true);

    let releaseGroupId!: (groupId: string) => void;
    const groupIdPromise = new Promise<string>((resolve) => { releaseGroupId = resolve; });
    releaseQueuedGroupId = releaseGroupId;
    mocks.getChatGroupId.mockReset().mockReturnValueOnce(groupIdPromise);
    act(() => {
      finishChatGeneration("session-1", controller!);
    });

    let retryAccepted: unknown;
    await act(async () => {
      retryAccepted = await mocks.chatInputSubmit?.();
      for (let attempt = 0; attempt < 20 && mocks.getChatGroupId.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(retryAccepted).toBe(true);
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(1);
    expect(mocks.chatInputValue).toBe("queued prompt");
    expect(hasActiveChatGeneration("session-1")).toBe(true);
    expect(useChatState.getState().isGenerating("session-1")).toBe(true);

    await act(async () => {
      abortChatGeneration("session-1");
      releaseGroupId("group-1");
      await groupIdPromise;
      for (let attempt = 0; attempt < 20 && hasActiveChatGeneration("session-1"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(hasActiveChatGeneration("session-1")).toBe(false);
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
});
