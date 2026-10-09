// @vitest-environment jsdom
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  db: {
    listChatGroups: vi.fn(),
    listChatMessages: vi.fn(),
    getSession: vi.fn(),
    createChatGroup: vi.fn(),
  },
  setCurrentChatGroupId: vi.fn(),
  setIsNewChatRequested: vi.fn(),
  completeNewChat: vi.fn(),
}));

vi.mock("@typr/plugin-db", () => ({ commands: fixture.db }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn(), debugWarnFor: vi.fn() }));

import { useChatQueries } from "./useChatQueries";
import { useChatState } from "@/stores/useChatState";

type ChatGroup = {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  name: null;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const sessionId = "session-a";
const existingGroupId = "group-a";
const noop = () => {};
let latestQueries: ReturnType<typeof useChatQueries> | undefined;
let queryClient: QueryClient;
let root: Root;
let container: HTMLDivElement;

function ChatQueryOwner() {
  latestQueries = useChatQueries({
    sessionId,
    userId: "user-a",
    currentChatGroupId: existingGroupId,
    setCurrentChatGroupId: fixture.setCurrentChatGroupId,
    setHasChatStarted: noop,
    isNewChatRequested: true,
    setIsNewChatRequested: fixture.setIsNewChatRequested,
    isNewChatPending: true,
    completeNewChat: fixture.completeNewChat,
    isActiveSurface: true,
    allowAutoSelectLatest: false,
    selectionSource: "sidebar",
  });
  return null;
}

function TestProviders({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

async function waitForInitialQueries() {
  await vi.waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
    expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(1);
    expect(fixture.db.getSession).toHaveBeenCalledTimes(1);
  });
}

describe("chat group creation cancellation", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture.db.listChatGroups.mockReset().mockResolvedValue([]);
    fixture.db.listChatMessages.mockReset().mockResolvedValue([]);
    fixture.db.getSession.mockReset().mockResolvedValue({
      id: sessionId,
      title: "Session A",
      raw_memo_html: "",
      enhanced_memo_html: null,
      pre_meeting_memo_html: null,
      words: [],
    });
    fixture.db.createChatGroup.mockReset();
    fixture.setCurrentChatGroupId.mockReset();
    fixture.setIsNewChatRequested.mockReset();
    fixture.completeNewChat.mockReset();
    latestQueries = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
    notifyManager.setNotifyFunction((callback) => { act(() => callback()); });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    useChatState.getState().clearSession(sessionId);
    latestQueries = undefined;
    notifyManager.setNotifyFunction((callback) => callback());
    vi.unstubAllGlobals();
    container.remove();
  });

  it("does not publish a group created for an aborted Ask and permits a later request", async () => {
    await act(async () => {
      root.render(createElement(TestProviders, null, createElement(ChatQueryOwner)));
    });
    await waitForInitialQueries();

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(latestQueries!.getChatGroupId(alreadyAborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.db.createChatGroup).not.toHaveBeenCalled();

    const oldCreate = deferred<ChatGroup>();
    fixture.db.createChatGroup.mockImplementationOnce(() => oldCreate.promise);
    const oldController = new AbortController();
    const oldOperation = latestQueries!.getChatGroupId(oldController.signal);
    await vi.waitFor(() => expect(fixture.db.createChatGroup).toHaveBeenCalledTimes(1));

    oldController.abort();
    await act(async () => {
      oldCreate.resolve({
        id: "group-from-aborted-ask",
        session_id: sessionId,
        user_id: "user-a",
        created_at: new Date().toISOString(),
        name: null,
      });
      await expect(oldOperation).rejects.toMatchObject({ name: "AbortError" });
    });

    expect(fixture.setCurrentChatGroupId).not.toHaveBeenCalled();
    expect(fixture.setIsNewChatRequested).not.toHaveBeenCalled();
    expect(fixture.completeNewChat).not.toHaveBeenCalled();
    expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(1);

    fixture.db.createChatGroup.mockResolvedValueOnce({
      id: "group-from-fresh-ask",
      session_id: sessionId,
      user_id: "user-a",
      created_at: new Date().toISOString(),
      name: null,
    });
    await expect(latestQueries!.getChatGroupId(new AbortController().signal)).resolves.toBe("group-from-fresh-ask");
    expect(fixture.setCurrentChatGroupId).toHaveBeenCalledWith("group-from-fresh-ask");
    expect(fixture.setIsNewChatRequested).toHaveBeenCalledWith(false);
    expect(fixture.completeNewChat).toHaveBeenCalledWith(sessionId);
    await vi.waitFor(() => expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(2));
  });
});
