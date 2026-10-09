// @vitest-environment jsdom

import { notifyManager, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { commands as dbCommands, type Session } from "@typr/plugin-db";
import type { Word } from "@typr/plugin-listener";

import { useTranscript } from "@/components/right-panel/hooks/useTranscript";
import { sessionQueryKey, sessionQueryOptions } from "./session-query";

vi.mock("@typr/plugin-db", () => ({
  commands: {
    getSession: vi.fn(),
    visitSession: vi.fn(),
  },
}));

vi.mock("@typr/plugin-listener", () => ({
  events: { sessionEvent: { listen: vi.fn(async () => vi.fn()) } },
}));

vi.mock("@typr/utils/contexts", () => ({
  useOngoingSession: (selector: (state: { status: string; sessionId: string | null }) => unknown) =>
    selector({ status: "inactive", sessionId: null }),
}));

vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));

const word = (text: string): Word => ({
  text,
  speaker: null,
  confidence: null,
  start_ms: null,
  end_ms: null,
});

const makeSession = (id: string, words: Word[]): Session => ({ id, words }) as Session;

function TranscriptHarness({
  sessionId,
  onWords,
}: {
  sessionId: string | null;
  onWords: (words: Word[]) => void;
}) {
  const { words } = useTranscript(sessionId);
  useEffect(() => {
    onWords(words);
  }, [words, onWords]);
  return null;
}

function SessionHarness({
  sessionId,
  onSession,
}: {
  sessionId: string;
  onSession: (session: Session | null | undefined) => void;
}) {
  const query = useQuery(sessionQueryOptions(sessionId));
  useEffect(() => {
    onSession(query.data);
  }, [query.data, onSession]);
  return null;
}

describe("session query sharing", () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let queryClient: QueryClient | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    notifyManager.setNotifyFunction((callback) => {
      act(() => callback());
    });
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

  it("shares the post-route session read with the actual transcript hook and refreshes edited words", async () => {
    const sessions: Record<string, Session> = {
      "note-a": makeSession("note-a", [word("before")]),
      "note-b": makeSession("note-b", [word("beta")]),
    };
    vi.mocked(dbCommands.getSession).mockImplementation(async (filter) =>
      "id" in filter ? sessions[filter.id] ?? null : null
    );
    vi.mocked(dbCommands.visitSession).mockResolvedValue(null);

    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    const sessionsStore = { insert: vi.fn() };

    await queryClient.fetchQuery({
      queryKey: sessionQueryKey("note-a"),
      queryFn: async () => {
        const [session] = await Promise.all([
          dbCommands.getSession({ id: "note-a" }),
          dbCommands.visitSession("note-a"),
        ]);
        if (session) {
          sessionsStore.insert(session);
        }
        return session;
      },
    });
    const capturedWords: Word[][] = [];
    const capturedSessions: (Session | null | undefined)[] = [];
    const onWords = (words: Word[]) => capturedWords.push(words);
    const onSession = (session: Session | null | undefined) => capturedSessions.push(session);
    container = document.createElement("div");
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        QueryClientProvider,
        { client: queryClient! },
        createElement("div", null,
          createElement(SessionHarness, { sessionId: "note-a", onSession }),
          createElement(TranscriptHarness, { sessionId: "note-a", onWords }),
        ),
      ));
    });
    await vi.waitFor(() => {
      expect(dbCommands.getSession).toHaveBeenCalledTimes(2);
      expect(capturedWords.at(-1)).toEqual([word("before")]);
      expect(capturedSessions.at(-1)?.id).toBe("note-a");
    });

    expect(dbCommands.visitSession).toHaveBeenCalledTimes(1);
    expect(sessionsStore.insert).toHaveBeenCalledTimes(1);

    sessions["note-a"] = makeSession("note-a", [word("after")]);
    await act(async () => {
      await queryClient?.invalidateQueries({ queryKey: sessionQueryKey("note-a") });
    });
    expect(queryClient.getQueryData<Session>(sessionQueryKey("note-a"))?.words).toEqual([word("after")]);
    await vi.waitFor(() => expect(capturedWords.at(-1)).toEqual([word("after")]));
    expect(capturedWords.at(-1)).toEqual([word("after")]);

    await act(async () => {
      root?.render(createElement(
        QueryClientProvider,
        { client: queryClient! },
        createElement("div", null,
          createElement(SessionHarness, { sessionId: "note-b", onSession }),
          createElement(TranscriptHarness, { sessionId: "note-b", onWords }),
        ),
      ));
    });
    await vi.waitFor(() => expect(capturedWords.at(-1)).toEqual([word("beta")]));
    expect(capturedWords.at(-1)).not.toEqual([word("after")]);
    expect(dbCommands.getSession).toHaveBeenCalledTimes(4);
  });

  it("keeps a null session empty and avoids a native read", async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
    const capturedWords: Word[][] = [];
    const onWords = (words: Word[]) => capturedWords.push(words);

    await act(async () => {
      root?.render(createElement(
        QueryClientProvider,
        { client: queryClient! },
        createElement(TranscriptHarness, { sessionId: null, onWords }),
      ));
    });

    expect(capturedWords.at(-1)).toEqual([]);
    expect(dbCommands.getSession).not.toHaveBeenCalled();
  });
});
