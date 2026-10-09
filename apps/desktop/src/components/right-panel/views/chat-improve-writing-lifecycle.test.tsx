// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chatDrafts: Record<string, string> = {};
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    renderTemplate: vi.fn(),
    upsertChatMessage: vi.fn(),
    inputFocus: vi.fn(),
    pendingFloatingPrompt: null as string | null,
    chatDrafts,
    getChatDraft: vi.fn((sessionId: string) => chatDrafts[sessionId] ?? ""),
    setChatDraft: vi.fn((sessionId: string, draft: string) => { chatDrafts[sessionId] = draft; }),
    clearChatDraft: vi.fn((sessionId: string) => { chatDrafts[sessionId] = ""; }),
    consumeFloatingPrompt: vi.fn(),
    getChatGroupId: vi.fn(),
    activeSessionId: "session-1",
    newChatRequest: null as null | { sessionId: string; requestId: number },
    isNewChatRequestedInQuery: false,
    selectionSessionId: "session-1" as string | null,
    clearSelection: vi.fn(() => { mocks.selectionSessionId = null; }),
    chatInputValue: "",
    chatInputSubmit: null as null | (() => unknown),
    chatInputChange: null as null | ((event: { target: { value: string } }) => void),
  };
});

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useMatch: ({ from }: { from: string }) => from === "/app/note/$id" && mocks.activeSessionId
    ? { params: { id: mocks.activeSessionId } }
    : null,
}));
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
    getChatDraft: mocks.getChatDraft,
    setChatDraft: mocks.setChatDraft,
    clearChatDraft: mocks.clearChatDraft,
    clearChatState: vi.fn(),
    newChatRequest: mocks.newChatRequest,
    requestNewChat: vi.fn(),
    consumeNewChatRequest: (requestId: number) => {
      if (mocks.newChatRequest?.requestId === requestId) {
        mocks.newChatRequest = null;
      }
    },
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
    ChatInput: ({ inputValue, onChange, onSubmit }: {
      inputValue: string;
      onChange: (event: { target: { value: string } }) => void;
      onSubmit: () => unknown;
    }) => {
      mocks.chatInputValue = inputValue;
      mocks.chatInputSubmit = onSubmit;
      mocks.chatInputChange = onChange;
      return React.createElement("textarea", { "data-testid": "chat-input", value: inputValue, readOnly: true });
    },
    ChatMessagesView: () => null,
    EmptyChatState: () => null,
  };
});
vi.mock("../components/search", () => ({ ChatSearchHeader: () => null }));
vi.mock("@/hooks/useEditModeModelSwitch.tsx", () => ({ useEditModeModelSwitch: vi.fn() }));

vi.mock("../hooks/useChatQueries", () => ({ useChatQueries: (options: { isNewChatRequested: boolean }) => {
  mocks.isNewChatRequestedInQuery = options.isNewChatRequested;
  return ({
  chatGroupsQuery: { data: [] },
  sessionData: { data: { title: "Test" }, refetch: async () => ({ data: { title: "Test", words: [] } }) },
  fetchSessionData: async () => ({ title: "Test", words: [] }),
  getChatGroupId: mocks.getChatGroupId,
  chatHistory: [],
  totalSessionMessagesQuery: { data: 0 },
  });
} }));
vi.mock("../utils/chat-utils", () => ({ focusInput: vi.fn(), formatDate: vi.fn() }));
vi.mock("@/stores/useSelectionContext", () => ({
  useSelectionContext: Object.assign(
    () => ({
      selectedText: "words",
      selectionRange: { from: 1, to: 6 },
      sessionId: mocks.selectionSessionId,
      clearSelection: mocks.clearSelection,
    }),
    { getState: () => ({ sessionId: mocks.selectionSessionId }) },
  ),
}));
vi.mock("@typr/utils/contexts", () => ({ useSessions: (selector: (state: object) => unknown) => selector({ sessions: {} }) }));
vi.mock("@typr/utils", () => ({
  AUTO_CLOUD_MODEL_ID: "auto",
  AUTO_CLOUD_MODEL_PRIORITY: [],
  CLOUD_GENERATION_TOKEN_BUDGETS: { chatAnswer: 1000 },
  containsUrl: () => false,
  extractUrls: () => [],
  resolveCloudModelIdForCurrentOs: (value: string) => value,
  setEnableBrowserSearch: vi.fn(),
}));
vi.mock("@typr/utils/ai", () => ({
  generateText: mocks.generateText,
  modelProvider: vi.fn(async () => ({ languageModel: () => ({}) })),
  streamText: mocks.streamText,
}));
vi.mock("@typr/plugin-connector", () => ({ commands: { getLlmConnection: vi.fn(async () => ({ type: "OpenAI" })) } }));
vi.mock("@typr/plugin-db", () => ({ commands: {
  upsertChatMessage: mocks.upsertChatMessage,
  sessionListParticipants: vi.fn(async () => []),
  sessionGetEvent: vi.fn(async () => null),
  getHuman: vi.fn(async () => null),
} }));
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
let releaseRouteGroupId: ((groupId: string) => void) | null = null;

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
    mocks.streamText.mockReset().mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => ({
      fullStream: (async function* () {
        await new Promise<never>((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      })(),
    }));
    mocks.renderTemplate.mockReset().mockImplementation(async (template: string) => template);
    mocks.upsertChatMessage.mockReset().mockResolvedValue(undefined);
    mocks.getChatGroupId.mockReset().mockResolvedValue("group-1");
    mocks.pendingFloatingPrompt = null;
    for (const sessionId of Object.keys(mocks.chatDrafts)) {
      delete mocks.chatDrafts[sessionId];
    }
    mocks.setChatDraft.mockClear();
    mocks.clearChatDraft.mockClear();
    mocks.getChatDraft.mockClear();
    mocks.consumeFloatingPrompt.mockReset();
    mocks.activeSessionId = "session-1";
    mocks.newChatRequest = null;
    mocks.isNewChatRequestedInQuery = false;
    mocks.selectionSessionId = "session-1";
    mocks.clearSelection.mockClear();
    mocks.chatInputValue = "";
    mocks.chatInputSubmit = null;
    mocks.chatInputChange = null;
    queuedPromptController = null;
    releaseQueuedGroupId = null;
    releaseRouteGroupId = null;
    for (const sessionId of ["session-1", "session-a", "session-b"]) {
      useChatState.getState().clearSession(sessionId);
    }
  });

  afterEach(async () => {
    act(() => root.unmount());
    if (queuedPromptController) {
      abortChatGeneration("session-1");
      releaseQueuedGroupId?.("group-1");
      finishChatGeneration("session-1", queuedPromptController);
      queuedPromptController = null;
    }
    if (releaseRouteGroupId) {
      await act(async () => {
        abortChatGeneration("session-a");
        releaseRouteGroupId?.("group-a");
        for (let attempt = 0; attempt < 20 && hasActiveChatGeneration("session-a"); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      });
      releaseRouteGroupId = null;
    }
    for (const sessionId of ["session-1", "session-a", "session-b"]) {
      useChatState.getState().clearSession(sessionId);
    }
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

  it("keeps the current note draft when a previous note's Ask preflight completes", async () => {
    mocks.activeSessionId = "session-a";
    mocks.selectionSessionId = "session-a";
    mocks.newChatRequest = { sessionId: "session-a", requestId: 1 };
    let resolveGroup!: (groupId: string) => void;
    const groupPromise = new Promise<string>((resolve) => { resolveGroup = resolve; });
    releaseRouteGroupId = resolveGroup;
    mocks.getChatGroupId.mockReturnValueOnce(groupPromise);

    await act(async () => {
      root.render(
        <I18nProvider i18n={i18n}>
          <ChatView layout="floating" />
        </I18nProvider>,
      );
    });
    expect(mocks.isNewChatRequestedInQuery).toBe(true);
    act(() => {
      mocks.chatInputChange?.({ target: { value: "question for A" } });
    });

    let accepted: unknown;
    await act(async () => {
      accepted = await mocks.chatInputSubmit?.();
      for (let attempt = 0; attempt < 20 && mocks.getChatGroupId.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(accepted).toBe(true);
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(1);

    mocks.activeSessionId = "session-b";
    mocks.selectionSessionId = "session-b";
    await act(async () => {
      root.render(
        <I18nProvider i18n={i18n}>
          <ChatView layout="floating" />
        </I18nProvider>,
      );
    });
    expect(mocks.isNewChatRequestedInQuery).toBe(false);
    act(() => {
      mocks.chatInputChange?.({ target: { value: "draft for B" } });
    });
    expect(mocks.chatDrafts["session-b"]).toBe("draft for B");
    expect(mocks.chatInputValue).toBe("draft for B");

    await act(async () => {
      resolveGroup("group-a");
      for (let attempt = 0; attempt < 20 && mocks.streamText.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(mocks.upsertChatMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "User", group_id: "group-a" }));
    expect(mocks.chatDrafts["session-a"]).toBe("");
    expect(mocks.chatDrafts["session-b"]).toBe("draft for B");
    expect(mocks.chatInputValue).toBe("draft for B");
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')?.value).toBe("draft for B");
    expect(mocks.selectionSessionId).toBe("session-b");

    await act(async () => {
      abortChatGeneration("session-a");
      for (let attempt = 0; attempt < 20 && hasActiveChatGeneration("session-a"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(hasActiveChatGeneration("session-a")).toBe(false);
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
