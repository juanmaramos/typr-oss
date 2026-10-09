// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  getChatGroupId: vi.fn(),
  fetchSessionData: vi.fn(),
  renderTemplate: vi.fn(),
  setInputValue: vi.fn(),
  panel: { surface: "floating" as "floating" | "sidebar" },
  streamStarted: (() => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; })(),
}));

vi.mock("@/contexts", () => ({ useRightPanel: () => ({ ...mocks.panel, currentView: "chat", floatingState: "expanded", openFloating: vi.fn() }) }));
vi.mock("@/stores/useSelectionContext", () => ({ useSelectionContext: () => ({ selectedText: "", selectionRange: null, sessionId: null, clearSelection: vi.fn() }) }));
vi.mock("@typr/utils/contexts", () => ({ useSessions: (selector: (state: object) => unknown) => selector({ sessions: {} }) }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));
vi.mock("@/utils/inline-diff-preview", () => ({ showInlineDiffPreview: vi.fn() }));
vi.mock("@typr/plugin-connector", () => ({ commands: { getLlmConnection: vi.fn(async () => ({ type: "OpenAI" })) } }));
vi.mock("@typr/plugin-db", () => ({ commands: {
  upsertChatMessage: vi.fn(async () => {}),
  sessionListParticipants: vi.fn(async () => []),
  sessionGetEvent: vi.fn(async () => null),
  getHuman: vi.fn(async () => null),
} }));
vi.mock("@typr/plugin-local-llm", () => ({ commands: { getCurrentModel: vi.fn(async () => "model") } }));
vi.mock("@typr/plugin-misc", () => ({ commands: {} }));
vi.mock("@typr/plugin-template", () => ({ commands: { render: mocks.renderTemplate } }));
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
  generateText: vi.fn(),
  modelProvider: vi.fn(async () => ({ languageModel: () => ({}) })),
  streamText: mocks.streamText,
}));

import { useChatState } from "@/stores/useChatState";
import { abortChatGeneration, hasActiveChatGeneration } from "./chat-generation";
import { useChatLogic } from "./useChatLogic";

let root: Root;
let container: HTMLDivElement;
let actions: ReturnType<typeof useChatLogic> | null = null;
let releasePendingGroupId: ((groupId: string) => void) | null = null;
let releasePendingStream: (() => void) | null = null;

function Harness({ sessionId }: { sessionId: string }) {
  actions = useChatLogic({
    sessionId,
    userId: null,
    activeEntity: { id: sessionId, type: "note" },
    inputValue: "hello",
    hasChatStarted: false,
    setInputValue: mocks.setInputValue,
    setHasChatStarted: vi.fn(),
    getChatGroupId: mocks.getChatGroupId,
    fetchSessionData: mocks.fetchSessionData,
    chatInputRef: { current: null },
    totalSessionMessages: 0,
  });
  return null;
}

describe("Stop after moving the live chat view", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
    actions = null;
    releasePendingGroupId = null;
    releasePendingStream = null;
    mocks.panel.surface = "floating";
    mocks.streamStarted = (() => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; })();
    mocks.getChatGroupId.mockReset().mockResolvedValue("group-1");
    mocks.fetchSessionData.mockReset().mockImplementation(async (sessionId: string) => ({
      title: `Note ${sessionId}`,
      words: [],
    }));
    mocks.renderTemplate.mockReset().mockImplementation(async (_template: string, variables?: { title?: string }) => {
      return variables?.title ? `system:${variables.title}` : "system";
    });
    mocks.setInputValue.mockReset();
    mocks.streamText.mockReset().mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      mocks.streamStarted.resolve();
      const fullStream = (async function* () {
        await new Promise<never>((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      })();
      return { fullStream };
    });
    for (const sessionId of ["session-1", "session-a", "session-b"]) {
      useChatState.getState().clearSession(sessionId);
    }
  });

  afterEach(async () => {
    releasePendingGroupId?.("group-1");
    releasePendingStream?.();
    await act(async () => {
      for (const sessionId of ["session-1", "session-a", "session-b"]) {
        abortChatGeneration(sessionId);
      }
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (!["session-1", "session-a", "session-b"].some(hasActiveChatGeneration)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(["session-1", "session-a", "session-b"].some(hasActiveChatGeneration)).toBe(false);
    act(() => root.unmount());
    for (const sessionId of ["session-1", "session-a", "session-b"]) {
      useChatState.getState().clearSession(sessionId);
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lets the replacement view stop the existing session stream", async () => {
    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    await act(async () => {
      actions?.handleSubmit();
      await mocks.streamStarted.promise;
    });
    const signal = mocks.streamText.mock.calls[0][0].abortSignal as AbortSignal;
    expect(signal.aborted).toBe(false);

    act(() => root.render(null));
    mocks.panel.surface = "sidebar";
    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    await act(async () => {
      actions?.handleStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(signal.aborted).toBe(true);
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
  });

  it("preserves partial stream progress and completes it after the view remounts", async () => {
    let finishStream!: () => void;
    const finalChunk = new Promise<void>((resolve) => { finishStream = resolve; });
    releasePendingStream = finishStream;
    let nextFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      animationFrames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => animationFrames.delete(id));
    mocks.streamText.mockReset().mockImplementation(({ abortSignal }: { abortSignal: AbortSignal }) => {
      mocks.streamStarted.resolve();
      const fullStream = (async function* () {
        yield { type: "text-delta", textDelta: "partial " };
        await finalChunk;
        if (abortSignal.aborted) {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
        yield { type: "text-delta", textDelta: "answer" };
      })();
      return { fullStream };
    });

    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    await act(async () => {
      actions?.handleSubmit();
      await mocks.streamStarted.promise;
      for (let attempt = 0; attempt < 30 && animationFrames.size === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (const [id, callback] of animationFrames) {
        animationFrames.delete(id);
        callback(0);
      }
    });
    expect(useChatState.getState().getMessages("session-1").map((message) => message.content)).toContain("partial ");

    act(() => { root.render(null); });
    mocks.panel.surface = "sidebar";
    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    expect(actions?.messages.map((message) => message.content)).toContain("partial ");

    await act(async () => {
      finishStream();
      for (let attempt = 0; attempt < 30 && hasActiveChatGeneration("session-1"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(useChatState.getState().getMessages("session-1").map((message) => message.content)).toContain("partial answer");
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
  });

  it("does not let Stop on a new note abort the previous note's stream", async () => {
    await act(async () => { root.render(<Harness sessionId="session-a" />); });
    await act(async () => {
      actions?.handleSubmit();
      await mocks.streamStarted.promise;
    });
    const signalA = mocks.streamText.mock.calls[0][0].abortSignal as AbortSignal;
    expect(signalA.aborted).toBe(false);

    await act(async () => { root.render(<Harness sessionId="session-b" />); });
    await act(async () => {
      actions?.handleSubmitWithValue("hello", { source: "test", bypassDebounce: true });
      for (let attempt = 0; attempt < 30 && mocks.streamText.mock.calls.length < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    const signalB = mocks.streamText.mock.calls[1][0].abortSignal as AbortSignal;
    expect(signalA.aborted).toBe(false);
    expect(signalB.aborted).toBe(false);

    await act(async () => {
      actions?.handleStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(signalB.aborted).toBe(true);
    expect(signalA.aborted).toBe(false);
    expect(useChatState.getState().isGenerating("session-a")).toBe(true);
    expect(useChatState.getState().isGenerating("session-b")).toBe(false);

    await act(async () => { root.render(<Harness sessionId="session-a" />); });
    await act(async () => {
      actions?.handleStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(signalA.aborted).toBe(true);
    expect(useChatState.getState().isGenerating("session-a")).toBe(false);
  });

  it("uses the originating note context after navigation during Ask preflight", async () => {
    let releaseGroupId!: (groupId: string) => void;
    const groupIdPromise = new Promise<string>((resolve) => { releaseGroupId = resolve; });
    releasePendingGroupId = releaseGroupId;
    mocks.getChatGroupId.mockReset().mockImplementationOnce(() => groupIdPromise);
    mocks.fetchSessionData.mockImplementation(async (sessionId: string) => ({
      title: `Title ${sessionId}`,
      rawContent: `Body ${sessionId}`,
      enhancedContent: null,
      preMeetingContent: null,
      words: [],
    }));

    await act(async () => { root.render(<Harness sessionId="session-a" />); });
    let accepted: boolean | undefined;
    await act(async () => {
      accepted = actions?.handleSubmitWithValue("summarize this note", { source: "test", bypassDebounce: true });
      for (let attempt = 0; attempt < 20 && mocks.getChatGroupId.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(accepted).toBe(true);

    await act(async () => { root.render(<Harness sessionId="session-b" />); });
    await act(async () => {
      releaseGroupId("group-a");
      await mocks.streamStarted.promise;
    });

    expect(mocks.fetchSessionData.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      "session-a",
      "session-a",
    ]);
    const messages = mocks.streamText.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain("Title session-a");
    expect(messages[0].content).not.toContain("Title session-b");

    await act(async () => {
      abortChatGeneration("session-a");
      for (let attempt = 0; attempt < 30 && hasActiveChatGeneration("session-a"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(hasActiveChatGeneration("session-a")).toBe(false);
  });

  it("keeps a preflight submission claimed when New Chat clears session generating state", async () => {
    let releaseGroupId!: (groupId: string) => void;
    const groupIdPromise = new Promise<string>((resolve) => { releaseGroupId = resolve; });
    releasePendingGroupId = releaseGroupId;
    mocks.getChatGroupId.mockReset()
      .mockImplementationOnce(() => groupIdPromise)
      .mockResolvedValue("group-1");

    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    await act(async () => {
      actions?.handleSubmitWithValue("first", { source: "test", bypassDebounce: true });
      for (let attempt = 0; attempt < 20 && mocks.getChatGroupId.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(1);

    act(() => { root.render(null); });
    act(() => {
      abortChatGeneration("session-1");
      useChatState.getState().clearSession("session-1");
    });
    await act(async () => { root.render(<Harness sessionId="session-1" />); });

    await act(async () => {
      await actions?.handleQuickAction("quick prompt");
    });
    expect(mocks.setInputValue).toHaveBeenCalledWith("quick prompt");
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(1);

    let secondAccepted: unknown;
    act(() => {
      secondAccepted = actions?.handleSubmitWithValue("second", { source: "test", bypassDebounce: true });
    });
    expect(secondAccepted).toBe(false);
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(1);
    expect(mocks.streamText).not.toHaveBeenCalled();

    let thirdAccepted: boolean | undefined;
    await act(async () => {
      releaseGroupId("group-1");
      for (let attempt = 0; attempt < 30 && !thirdAccepted; attempt += 1) {
        thirdAccepted = actions?.handleSubmitWithValue("third", { source: "test", bypassDebounce: true });
        if (!thirdAccepted) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      for (let attempt = 0; attempt < 30 && mocks.streamText.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(thirdAccepted).toBe(true);
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(2);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    const signal = mocks.streamText.mock.calls[0][0].abortSignal as AbortSignal;
    await act(async () => {
      actions?.handleStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(signal.aborted).toBe(true);
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
  });

  it("releases the session claim after preflight rejects and allows a fresh submission", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getChatGroupId.mockReset()
      .mockRejectedValueOnce(new Error("group lookup failed"))
      .mockResolvedValue("group-1");

    await act(async () => { root.render(<Harness sessionId="session-1" />); });

    let firstAccepted: boolean | undefined;
    act(() => {
      firstAccepted = actions?.handleSubmitWithValue("first", { source: "test", bypassDebounce: true });
    });
    expect(firstAccepted).toBe(true);
    expect(hasActiveChatGeneration("session-1")).toBe(true);

    await act(async () => {
      for (let attempt = 0; attempt < 30 && hasActiveChatGeneration("session-1"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(hasActiveChatGeneration("session-1")).toBe(false);
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
    expect(mocks.streamText).not.toHaveBeenCalled();

    let retryAccepted: boolean | undefined;
    await act(async () => {
      retryAccepted = actions?.handleSubmitWithValue("retry", { source: "test", bypassDebounce: true });
      await mocks.streamStarted.promise;
    });
    expect(retryAccepted).toBe(true);
    expect(mocks.getChatGroupId).toHaveBeenCalledTimes(2);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);

    await act(async () => {
      actions?.handleStop();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);
  });

  it("does not start direct Improve Writing while an aborted operation still owns the session", async () => {
    let releaseGroupId!: (groupId: string) => void;
    const groupIdPromise = new Promise<string>((resolve) => { releaseGroupId = resolve; });
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    mocks.getChatGroupId.mockReset().mockImplementationOnce(() => groupIdPromise);

    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    await act(async () => {
      actions?.handleSubmitWithValue("first", { source: "test", bypassDebounce: true });
      for (let attempt = 0; attempt < 20 && mocks.getChatGroupId.mock.calls.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(hasActiveChatGeneration("session-1")).toBe(true);

    act(() => { root.render(null); });
    act(() => {
      abortChatGeneration("session-1");
      useChatState.getState().clearSession("session-1");
    });
    await act(async () => { root.render(<Harness sessionId="session-1" />); });
    expect(useChatState.getState().isGenerating("session-1")).toBe(false);

    let improveTask: Promise<void> | undefined;
    act(() => {
      improveTask = actions?.handleImproveWriting("selected text", { from: 1, to: 14 });
    });
    const messagesAfterImproveRequest = useChatState.getState().getMessages("session-1");

    releaseGroupId("group-1");
    await act(async () => {
      frameCallbacks.shift()?.(0);
      await improveTask;
      for (let attempt = 0; attempt < 30 && hasActiveChatGeneration("session-1"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(messagesAfterImproveRequest).toHaveLength(0);
    expect(useChatState.getState().getMessages("session-1")).toHaveLength(0);
    expect(hasActiveChatGeneration("session-1")).toBe(false);
  });
});
