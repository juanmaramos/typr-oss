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
  activeSessionId: "session-a",
  activeGroupId: "group-a" as string | null,
  groupIdsBySession: { "session-a": "group-a" } as Record<string, string | null>,
  newChatRequested: true,
  newChatPending: true,
  allowAutoSelectLatest: false,
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

function SwitchingChatQueryOwner() {
  const sessionId = fixture.activeSessionId;
  latestQueries = useChatQueries({
    sessionId,
    userId: "user-a",
    currentChatGroupId: fixture.groupIdsBySession[sessionId] ?? null,
    setCurrentChatGroupId: (id) => {
      fixture.groupIdsBySession[sessionId] = id;
      if (fixture.activeSessionId === sessionId) {
        fixture.activeGroupId = id;
      }
      fixture.setCurrentChatGroupId(id);
    },
    setHasChatStarted: noop,
    isNewChatRequested: fixture.newChatRequested,
    setIsNewChatRequested: (requested) => {
      if (fixture.activeSessionId === sessionId) {
        fixture.newChatRequested = requested;
        fixture.setIsNewChatRequested(requested);
      }
    },
    isNewChatPending: fixture.newChatPending,
    completeNewChat: fixture.completeNewChat,
    isActiveSurface: true,
    allowAutoSelectLatest: fixture.allowAutoSelectLatest,
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
    fixture.activeSessionId = sessionId;
    fixture.activeGroupId = existingGroupId;
    fixture.groupIdsBySession = { [sessionId]: existingGroupId };
    fixture.newChatRequested = true;
    fixture.newChatPending = true;
    fixture.allowAutoSelectLatest = false;
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

  it("keeps late group creation and note-context reads scoped to the originating session", async () => {
    queryClient.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 60_000, retry: false } } });
    const oldGroupsForA = deferred<ChatGroup[]>();
    const originalGroupA: ChatGroup = {
      id: "old-group-a",
      session_id: "session-a",
      user_id: "user-a",
      created_at: "2025-01-01T00:00:00.000Z",
      name: null,
    };
    const createdGroupA: ChatGroup = {
      id: "group-from-a",
      session_id: "session-a",
      user_id: "user-a",
      created_at: new Date().toISOString(),
      name: null,
    };
    const groupB: ChatGroup = {
      id: "group-b",
      session_id: "session-b",
      user_id: "user-a",
      created_at: new Date().toISOString(),
      name: null,
    };
    let aGroupLoads = 0;
    fixture.db.listChatGroups.mockImplementation(async (requestedSessionId: string) => {
      if (requestedSessionId === "session-a") {
        aGroupLoads += 1;
        if (aGroupLoads === 2) {
          return oldGroupsForA.promise;
        }
        return [originalGroupA, createdGroupA].slice(0, aGroupLoads === 1 ? 1 : 2);
      }
      return requestedSessionId === "session-b" ? [groupB] : [];
    });
    fixture.db.listChatMessages.mockImplementation(async (groupId: string) => groupId === "group-b"
      ? [{
        id: "message-b",
        group_id: "group-b",
        role: "User",
        content: "B message",
        created_at: new Date().toISOString(),
        parts: null,
      }]
      : []);
    fixture.db.getSession.mockImplementation(async ({ id }: { id: string }) => ({
      id,
      title: `Session ${id}`,
      raw_memo_html: `Body ${id}`,
      enhanced_memo_html: null,
      pre_meeting_memo_html: null,
      words: [],
    }));

    await act(async () => {
      root.render(createElement(TestProviders, null, createElement(SwitchingChatQueryOwner)));
    });
    await waitForInitialQueries();

    fixture.groupIdsBySession["session-a"] = "old-group-a";
    await act(async () => {
      void queryClient.refetchQueries({ queryKey: ["chat-groups", "session-a"], type: "active" });
    });
    await vi.waitFor(() => expect(fixture.db.listChatGroups).toHaveBeenCalledTimes(2));

    const queriesForA = latestQueries!;
    const fetchSessionDataForA = queriesForA.fetchSessionData;
    const createGroup = deferred<ChatGroup>();
    fixture.db.createChatGroup.mockImplementationOnce(() => createGroup.promise);
    const createOperation = queriesForA.getChatGroupId(new AbortController().signal);
    await vi.waitFor(() => expect(fixture.db.createChatGroup).toHaveBeenCalledTimes(1));

    fixture.activeSessionId = "session-b";
    fixture.activeGroupId = null;
    fixture.newChatRequested = false;
    fixture.newChatPending = false;
    fixture.allowAutoSelectLatest = true;
    await act(async () => {
      root.render(createElement(TestProviders, null, createElement(SwitchingChatQueryOwner)));
    });
    await vi.waitFor(() => {
      expect(fixture.db.listChatGroups.mock.calls.filter(([requestedSessionId]) => requestedSessionId === "session-b"))
        .toHaveLength(1);
    });

    await act(async () => {
      createGroup.resolve(createdGroupA);
      await expect(createOperation).resolves.toBe("group-from-a");
    });
    expect(queryClient.getQueryData<ChatGroup[]>(["chat-groups", "session-a"])).toEqual([
      expect.objectContaining({ id: "old-group-a" }),
      expect.objectContaining({
        id: "group-from-a",
        firstMessage: "",
        mostRecentMessageTimestamp: new Date(createdGroupA.created_at).getTime(),
      }),
    ]);

    const contextForA = await fetchSessionDataForA("session-a");
    expect(contextForA?.title).toBe("Session session-a");
    expect(fixture.db.getSession).toHaveBeenLastCalledWith({ id: "session-a" });
    await vi.waitFor(() => expect(fixture.setCurrentChatGroupId).toHaveBeenCalledWith("group-b"));
    expect(fixture.db.listChatGroups.mock.calls.filter(([requestedSessionId]) => requestedSessionId === "session-b"))
      .toHaveLength(1);

    await act(async () => { oldGroupsForA.resolve([originalGroupA]); });
    expect(queryClient.getQueryData<ChatGroup[]>(["chat-groups", "session-a"])).toEqual([
      expect.objectContaining({ id: "old-group-a" }),
      expect.objectContaining({ id: "group-from-a" }),
    ]);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat-groups", "session-b"] });
    });
    expect(fixture.db.listChatGroups.mock.calls.filter(([requestedSessionId]) => requestedSessionId === "session-b"))
      .toHaveLength(2);
    expect(fixture.setCurrentChatGroupId.mock.calls.map(([groupId]) => groupId)).toContain("group-b");

    fixture.activeSessionId = "session-a";
    fixture.activeGroupId = fixture.groupIdsBySession["session-a"] ?? null;
    await act(async () => {
      root.render(createElement(TestProviders, null, createElement(SwitchingChatQueryOwner)));
    });
    await vi.waitFor(() => expect(fixture.db.listChatGroups.mock.calls.filter(([requestedSessionId]) => requestedSessionId === "session-a"))
      .toHaveLength(3));
    await vi.waitFor(() => expect(fixture.groupIdsBySession["session-a"]).toBe("group-from-a"));
    expect(fixture.activeGroupId).toBe("group-from-a");
  });
});
