import type { InfiniteData, QueryClient } from "@tanstack/react-query";

type SessionPage = {
  sessions: [string, { id: string }[]][];
};

/**
 * Optimistically remove one or more sessions from the React Query cache.
 *
 * This avoids a full refetch of the `["sessions"]` infinite query (which
 * triggers N `sessionGetEvent` IPC calls and a broadcast storm) by surgically
 * removing the entries from every cached page.
 */
export function removeSessionsFromCache(
  queryClient: QueryClient,
  sessionIds: string[],
) {
  const idSet = new Set(sessionIds);

  // 1. Remove individual session queries (synchronous).
  for (const id of sessionIds) {
    queryClient.removeQueries({ queryKey: ["session", id] });
  }

  // 2. Optimistically patch the infinite sessions list.
  queryClient.setQueriesData<InfiniteData<SessionPage>>(
    { queryKey: ["sessions"] },
    (old) => {
      if (!old) {
        return old;
      }

      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          sessions: page.sessions
            .map(([group, items]) =>
              [
                group,
                items.filter((s) => !idSet.has(s.id)),
              ] as [string, typeof items]
            )
            .filter(([, items]) => items.length > 0),
        })),
      };
    },
  );
}
