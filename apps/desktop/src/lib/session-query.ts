import { commands as dbCommands } from "@typr/plugin-db";

export const sessionQueryKey = (sessionId: string | null) => ["session", sessionId] as const;

export const sessionQueryOptions = (sessionId: string | null) => ({
  queryKey: sessionQueryKey(sessionId),
  queryFn: () => dbCommands.getSession({ id: sessionId! }),
  enabled: !!sessionId,
});

export const sessionWordsQueryOptions = (sessionId: string | null) => ({
  ...sessionQueryOptions(sessionId),
  select: (session: Awaited<ReturnType<typeof dbCommands.getSession>>) => session?.words ?? [],
});
