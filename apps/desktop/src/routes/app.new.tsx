import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Query, QueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { isReusableDraftSession } from "@/lib/note-draft";
import { markNewNoteTrace, timeNewNoteStep } from "@/utils/new-note-debug";
import { commands as dbCommands } from "@typr/plugin-db";

const schema = z.object({
  record: z.boolean().optional(),
  calendarEventId: z.string().optional(),
});

function refreshNewNoteLists(queryClient: QueryClient) {
  void timeNewNoteStep(
    "invalidate events",
    () =>
      queryClient.invalidateQueries({
        predicate: (query: Query) => query.queryKey[0] === "events",
      }),
  ).catch((error) => {
    markNewNoteTrace("invalidate events:error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  void timeNewNoteStep(
    "invalidate session queries",
    () =>
      queryClient.invalidateQueries({
        predicate: (query: Query) =>
          query.queryKey.some((key: unknown) => (typeof key === "string") && key.includes("session")),
      }),
  ).catch((error) => {
    markNewNoteTrace("invalidate session queries:error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function scheduleNewNoteListRefresh(queryClient: QueryClient) {
  const refresh = () => refreshNewNoteLists(queryClient);

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(refresh, { timeout: 1000 });
    return;
  }

  setTimeout(refresh, 250);
}

export const Route = createFileRoute("/app/new")({
  validateSearch: zodValidator(schema),
  beforeLoad: async ({
    context: { queryClient, ongoingSessionStore, sessionsStore, userId },
    search: { record, calendarEventId },
  }): Promise<any> => {
    try {
      markNewNoteTrace(
        "route:/app/new:start",
        { record: !!record, calendarEvent: !!calendarEventId },
        { createIfMissingSource: "route" },
      );

      let targetSessionId: string | null = null;
      const { insert } = sessionsStore.getState();

      if (calendarEventId) {
        const existingEventSession = await timeNewNoteStep(
          "event session lookup",
          () => dbCommands.getSession({ calendarEventId }),
        );

        if (existingEventSession) {
          targetSessionId = existingEventSession.id;
          insert(existingEventSession);
          markNewNoteTrace("event session reused", { sessionId: targetSessionId });
        } else {
          const event = await timeNewNoteStep(
            "event fetch",
            () =>
              queryClient.fetchQuery({
                queryKey: ["event", calendarEventId],
                queryFn: () => dbCommands.getEvent(calendarEventId!),
              }),
          );

          const sessionId = crypto.randomUUID();
          const session = await timeNewNoteStep(
            "session create",
            () =>
              dbCommands.upsertSession({
                id: sessionId,
                user_id: userId,
                created_at: new Date().toISOString(),
                visited_at: new Date().toISOString(),
                calendar_event_id: event?.id ?? null,
                space_id: null,
                title: event?.name ?? "",
                raw_memo_html: "",
                enhanced_memo_html: null,
                auto_enhanced_memo_html: null,
                words: [],
                record_start: null,
                record_end: null,
                pre_meeting_memo_html: null,
                source_type: "manual",
                source_metadata: null,
                needs_enhance: false,
              }),
            { calendarEvent: true },
          );
          await timeNewNoteStep("participant add", () => dbCommands.sessionAddParticipant(sessionId, userId));
          insert(session);
          markNewNoteTrace("session cache insert", { sessionId: session.id, reused: false });
          targetSessionId = session.id;
        }
      } else {
        const recentSessions = await timeNewNoteStep(
          "recent sessions list",
          () =>
            dbCommands.listSessions({
              type: "recentlyVisited",
              user_id: userId,
              limit: 200,
            }),
        );

        const existingDraft = recentSessions.find(isReusableDraftSession);
        markNewNoteTrace("draft scan", {
          recentCount: recentSessions.length,
          reused: !!existingDraft,
        });

        if (existingDraft) {
          targetSessionId = existingDraft.id;
          insert(existingDraft);
          markNewNoteTrace("session cache insert", { sessionId: targetSessionId, reused: true });
          await timeNewNoteStep(
            "draft visit",
            () => dbCommands.visitSession(existingDraft.id).catch(() => undefined),
          );
        } else {
          const sessionId = crypto.randomUUID();
          const session = await timeNewNoteStep(
            "session create",
            () =>
              dbCommands.upsertSession({
                id: sessionId,
                user_id: userId,
                created_at: new Date().toISOString(),
                visited_at: new Date().toISOString(),
                calendar_event_id: null,
                space_id: null,
                title: "",
                raw_memo_html: "",
                enhanced_memo_html: null,
                auto_enhanced_memo_html: null,
                words: [],
                record_start: null,
                record_end: null,
                pre_meeting_memo_html: null,
                source_type: "manual",
                source_metadata: null,
                needs_enhance: false,
              }),
            { calendarEvent: false },
          );
          await timeNewNoteStep("participant add", () => dbCommands.sessionAddParticipant(sessionId, userId));
          insert(session);
          markNewNoteTrace("session cache insert", { sessionId: session.id, reused: false });
          targetSessionId = session.id;
        }
      }

      if (!targetSessionId) {
        throw new Error(i18n._(msg`Failed to resolve target session for /app/new`));
      }

      if (record) {
        const { start } = ongoingSessionStore.getState();
        start(targetSessionId);
        markNewNoteTrace("recording start requested", { sessionId: targetSessionId });
      }

      markNewNoteTrace("redirect:/app/note/$id", { sessionId: targetSessionId });
      scheduleNewNoteListRefresh(queryClient);

      return redirect({
        to: "/app/note/$id",
        params: { id: targetSessionId },
      });
    } catch (error) {
      markNewNoteTrace("route:/app/new:error", {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(error);
      return redirect({ to: "/app" });
    }
  },
});
