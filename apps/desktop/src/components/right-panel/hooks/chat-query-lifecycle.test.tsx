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
  pendingGroup: {
    setCurrentChatGroupId: vi.fn(),
    setPendingCreatedChatGroupId: vi.fn(),
    setIsNewChatRequested: vi.fn(),
    completeNewChat: vi.fn(),
  },
}));

vi.mock("@typr/plugin-db", () => ({ commands: fixture.db }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn(), debugWarnFor: vi.fn() }));

import { useChatQueries } from "./useChatQueries";
import { useChatState } from "@/stores/useChatState";

type DbMessage = {
  id: string;
  role: "User" | "Assistant";
  content: string;
  parts: string | null;
  created_at: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const sessionId = "session-a";
const chatGroupId = "group-a";
const chatGroup = {
  id: chatGroupId,
  session_id: sessionId,
  user_id: "user-a",
  created_at: "2026-10-09T10:00:00.000Z",
  name: null,
};
const initialMessages: DbMessage[] = [{
  id: "message-a",
  role: "User",
  content: "Question",
  parts: null,
  created_at: "2026-10-09T10:00:01.000Z",
}];
const completedMessages: DbMessage[] = [
  ...initialMessages,
  {
    id: "assistant-completed",
    role: "Assistant",
    content: "Fresh completed answer",
    parts: "[]",
    created_at: "2026-10-09T10:00:02.000Z",
  },
];
const noop = () => {};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function ChatQueryOwner() {
  latestQueries = useChatQueries({
    sessionId,
    userId: "user-a",
    currentChatGroupId: chatGroupId,
    setCurrentChatGroupId: noop,
    setHasChatStarted: noop,
    isNewChatRequested: false,
    setIsNewChatRequested: noop,
    isNewChatPending: false,
    completeNewChat: noop,
    pendingCreatedChatGroupId: null,
    setPendingCreatedChatGroupId: noop,
    isActiveSurface: true,
    allowAutoSelectLatest: false,
    selectionSource: "sidebar",
  });
  return null;
}

function PendingCreatedGroupOwner() {
  latestQueries = useChatQueries({
    sessionId,
    userId: "user-a",
    currentChatGroupId: "group-new",
    setCurrentChatGroupId: fixture.pendingGroup.setCurrentChatGroupId,
    setHasChatStarted: noop,
    isNewChatRequested: false,
    setIsNewChatRequested: noop,
    isNewChatPending: false,
    completeNewChat: noop,
    pendingCreatedChatGroupId: "group-new",
    setPendingCreatedChatGroupId: fixture.pendingGroup.setPendingCreatedChatGroupId,
    isActiveSurface: true,
    allowAutoSelectLatest: true,
    selectionSource: "sidebar",
  });
  return null;
}

function NewChatOwner() {
  latestQueries = useChatQueries({
    sessionId,
    userId: "user-a",
    currentChatGroupId: chatGroupId,
    setCurrentChatGroupId: fixture.pendingGroup.setCurrentChatGroupId,
    setHasChatStarted: noop,
    isNewChatRequested: true,
    setIsNewChatRequested: fixture.pendingGroup.setIsNewChatRequested,
    isNewChatPending: true,
    completeNewChat: fixture.pendingGroup.completeNewChat,
    pendingCreatedChatGroupId: null,
    setPendingCreatedChatGroupId: fixture.pendingGroup.setPendingCreatedChatGroupId,
    isActiveSurface: true,
    allowAutoSelectLatest: false,
    selectionSource: "sidebar",
  });
  return null;
}

function Harness({ mounted, owner }: { mounted: boolean; owner: "default" | "pending-created-group" | "new-chat" }) {
  if (!mounted) return null;
  if (owner === "pending-created-group") return createElement(PendingCreatedGroupOwner);
  if (owner === "new-chat") return createElement(NewChatOwner);
  return createElement(ChatQueryOwner);
}

function TestProviders({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let latestQueries: ReturnType<typeof useChatQueries> | undefined;

function readCounts() {
  return {
    listChatGroups: fixture.db.listChatGroups.mock.calls.length,
    listChatMessages: fixture.db.listChatMessages.mock.calls.length,
    getSession: fixture.db.getSession.mock.calls.length,
  };
}

async function renderOwner(
  mounted: boolean,
  owner: "default" | "pending-created-group" | "new-chat" = "default",
) {
  await act(async () => {
    root.render(createElement(TestProviders, null, createElement(Harness, { mounted, owner })));
  });
}

async function waitForCounts(expected: ReturnType<typeof readCounts>) {
  await vi.waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
    expect(readCounts()).toEqual(expected);
  });
}

describe("chat query lifecycle cache retention", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture.db.listChatGroups.mockReset().mockResolvedValue([chatGroup]);
    fixture.db.listChatMessages.mockReset().mockResolvedValue(initialMessages);
    fixture.db.getSession.mockReset().mockResolvedValue({
      id: sessionId,
      title: "Session A",
      raw_memo_html: "",
      enhanced_memo_html: null,
      pre_meeting_memo_html: null,
      words: [],
    });
    fixture.db.createChatGroup.mockReset().mockResolvedValue({ ...chatGroup, id: "group-created" });
    useChatState.getState().clearSession(sessionId);
    latestQueries = undefined;
    fixture.pendingGroup.setCurrentChatGroupId.mockReset();
    fixture.pendingGroup.setPendingCreatedChatGroupId.mockReset();
    fixture.pendingGroup.setIsNewChatRequested.mockReset();
    fixture.pendingGroup.completeNewChat.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    container.remove();
  });

  it("serves retained data during reopen refresh without rolling back a completed response, then expires it", async () => {
    const initialCounts = { listChatGroups: 1, listChatMessages: 3, getSession: 1 };
    await renderOwner(true);
    await waitForCounts(initialCounts);

    const initialQueryMessages = queryClient.getQueryData(["chat-messages", chatGroupId]);
    expect(initialQueryMessages).toHaveLength(1);
    expect(useChatState.getState().getMessages(sessionId).map((message) => message.id)).toEqual(["message-a"]);

    await renderOwner(false);
    expect(queryClient.getQueryData(["chat-messages", chatGroupId])).toEqual(initialQueryMessages);

    const completedLocalMessage = {
      id: "assistant-completed",
      content: "Fresh completed answer",
      isUser: false,
      timestamp: new Date("2026-10-09T10:00:02.000Z"),
      parts: [],
    };
    act(() => useChatState.getState().setMessages(sessionId, [
      useChatState.getState().getMessages(sessionId)[0],
      completedLocalMessage,
    ]));

    const freshDbRead = deferred<DbMessage[]>();
    fixture.db.listChatMessages.mockImplementation(() => freshDbRead.promise);
    await renderOwner(true);

    await vi.waitFor(() => {
      expect(readCounts()).toEqual({ listChatGroups: 2, listChatMessages: 6, getSession: 2 });
      expect(latestQueries?.chatMessagesQuery.isFetching).toBe(true);
    });
    expect(latestQueries?.chatMessagesQuery.data?.map((message) => message.id)).toEqual(["message-a"]);
    expect(useChatState.getState().getMessages(sessionId).map((message) => message.id)).toEqual([
      "message-a",
      "assistant-completed",
    ]);

    await act(async () => {
      freshDbRead.resolve(completedMessages);
      await freshDbRead.promise;
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(useChatState.getState().getMessages(sessionId).map((message) => message.id)).toEqual([
        "message-a",
        "assistant-completed",
      ]);
    });
    expect(readCounts()).toEqual({ listChatGroups: 2, listChatMessages: 6, getSession: 2 });
    expect(useChatState.getState().getMessages(sessionId)[1].content).toBe("Fresh completed answer");

    vi.useFakeTimers();
    await renderOwner(false);
    expect(queryClient.getQueryData(["chat-messages", chatGroupId])).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not select a stale cached group while a newly created group is refreshing after reopen", async () => {
    const staleDbGroup = {
      ...chatGroup,
      id: "group-old",
    };
    const freshGroup = { ...chatGroup, id: "group-new" };
    const groupRefresh = deferred<typeof freshGroup[]>();
    fixture.db.listChatGroups.mockResolvedValue([staleDbGroup]);

    // The owner is closed while the cache is populated, then reopened with the
    // newly created group still pending in the session-level UI state.
    await renderOwner(true, "pending-created-group");
    await waitForCounts({ listChatGroups: 1, listChatMessages: 3, getSession: 1 });
    const staleGroup = queryClient.getQueryData(["chat-groups", sessionId]);
    expect(staleGroup).toMatchObject([{ id: "group-old" }]);
    await renderOwner(false, "pending-created-group");
    fixture.db.listChatGroups.mockImplementation(() => groupRefresh.promise);
    await renderOwner(true, "pending-created-group");

    await vi.waitFor(() => {
      expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(2);
      expect(latestQueries?.chatGroupsQuery.isFetching).toBe(true);
    });
    expect(latestQueries?.chatGroupsQuery.data).toEqual(staleGroup);
    expect(fixture.pendingGroup.setCurrentChatGroupId).not.toHaveBeenCalled();
    expect(fixture.pendingGroup.setPendingCreatedChatGroupId).not.toHaveBeenCalled();

    await act(async () => {
      groupRefresh.resolve([freshGroup]);
      await groupRefresh.promise;
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(fixture.pendingGroup.setPendingCreatedChatGroupId).toHaveBeenCalledWith(sessionId, null);
    });

    expect(latestQueries?.chatGroupsQuery.data?.map((group) => group.id)).toEqual(["group-new"]);
    expect(fixture.pendingGroup.setCurrentChatGroupId).not.toHaveBeenCalled();
  });

  it("does not publish a group created for an aborted Ask and allows a later request", async () => {
    await renderOwner(true, "new-chat");
    await waitForCounts({ listChatGroups: 1, listChatMessages: 3, getSession: 1 });

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(latestQueries!.getChatGroupId(alreadyAborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.db.createChatGroup).not.toHaveBeenCalled();

    const oldCreate = deferred<typeof chatGroup>();
    fixture.db.createChatGroup.mockReset().mockImplementationOnce(() => oldCreate.promise);
    const oldController = new AbortController();
    const oldOperation = latestQueries!.getChatGroupId(oldController.signal);
    await vi.waitFor(() => expect(fixture.db.createChatGroup).toHaveBeenCalledTimes(1));

    oldController.abort();
    await act(async () => {
      oldCreate.resolve({ ...chatGroup, id: "group-from-aborted-ask" });
      await expect(oldOperation).rejects.toMatchObject({ name: "AbortError" });
    });
    expect(fixture.pendingGroup.setCurrentChatGroupId).not.toHaveBeenCalled();
    expect(fixture.pendingGroup.setPendingCreatedChatGroupId).not.toHaveBeenCalled();
    expect(fixture.pendingGroup.setIsNewChatRequested).not.toHaveBeenCalled();
    expect(fixture.pendingGroup.completeNewChat).not.toHaveBeenCalled();
    expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(1);

    fixture.db.createChatGroup.mockResolvedValueOnce({ ...chatGroup, id: "group-from-fresh-ask" });
    await expect(latestQueries!.getChatGroupId(new AbortController().signal)).resolves.toBe("group-from-fresh-ask");
    expect(fixture.pendingGroup.setCurrentChatGroupId).toHaveBeenCalledWith("group-from-fresh-ask");
    expect(fixture.pendingGroup.setPendingCreatedChatGroupId).toHaveBeenCalledWith(sessionId, "group-from-fresh-ask");
    expect(fixture.pendingGroup.setIsNewChatRequested).toHaveBeenCalledWith(false);
    expect(fixture.pendingGroup.completeNewChat).toHaveBeenCalledWith(sessionId);
    await vi.waitFor(() => expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(2));
  });
});
