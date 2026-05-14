import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect } from "react";
import { z } from "zod";

import EditorArea from "@/components/editor-area";
import { FloatingMeetingAssistant } from "@/components/meeting-assistant/floating-assistant";
import { useTypr, useLeftSidebar, useRightPanel } from "@/contexts";
import { useEnhancePendingState } from "@/hooks/enhance-pending";
import { markNewNoteTrace, timeNewNoteStep } from "@/utils/new-note-debug";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { commands as dbCommands, type Session } from "@typr/plugin-db";
import {
  commands as windowsCommands,
  events as windowsEvents,
  getCurrentWebviewWindowLabel,
} from "@typr/plugin-windows";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSession } from "@typr/utils/contexts";

const searchSchema = z.object({
  from: z.enum(["project", "space"]).optional(),
  projectId: z.string().optional(),
  spaceId: z.string().optional(),
});

export const Route = createFileRoute("/app/note/$id")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ context: { queryClient, sessionsStore }, params: { id } }): Promise<any> => {
    markNewNoteTrace("route:/app/note/$id:start", { sessionId: id });

    return queryClient.fetchQuery({
      queryKey: ["session", id],
      queryFn: async (): Promise<any> => {
        let session: Session | null = null;

        try {
          // Reduced logging - loading session
          const [s, _] = await timeNewNoteStep(
            "note fetch+visit",
            () =>
              Promise.all([
                dbCommands.getSession({ id }),
                dbCommands.visitSession(id),
              ]),
          );
          session = s;
        } catch (e) {
          markNewNoteTrace("note fetch+visit:error", {
            sessionId: id,
            error: e instanceof Error ? e.message : String(e),
          });
          console.error("❌ [Route] Error fetching session:", e);
        }

        if (!session) {
          markNewNoteTrace("route:/app/note/$id:not-found", { sessionId: id });
          console.log("❌ [Route] Session not found, redirecting to /app");
          return redirect({ to: "/app" });
        }

        const { insert } = sessionsStore.getState();
        insert(session);
        markNewNoteTrace("note cache insert", { sessionId: id });

        return session;
      },
    });
  },
  component: Component,
});

function Component() {
  const { id: sessionId } = Route.useParams();

  const { getLatestSession, session } = useSession(sessionId, (s) => ({ getLatestSession: s.get, session: s.session }));
  const getOngoingSession = useOngoingSession((s) => s.get);

  // Sidebar states for dynamic rounded corners
  const { isExpanded: _leftSidebarExpanded } = useLeftSidebar();
  useRightPanel();

  const queryClient = useQueryClient();

  useEffect(() => {
    const isEmpty = (s: string | null) => s === "<p></p>" || !s;
    let isActive = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Schedule cleanup check when component unmounts
    return () => {
      timeoutId = setTimeout(async () => {
        if (!isActive) {
          return;
        }

        try {
          const { session } = getLatestSession();
          const { sessionId: ongoingSessionId } = getOngoingSession();

          const chatGroups = await dbCommands.listChatGroups(session.id);
          const hasChatMessages = chatGroups.length > 0;

          const isRecentlyCreated = new Date().getTime() - new Date(session.created_at).getTime() < 60000;
          const isYouTubeImport = session.source_type === "youtube";

          const shouldDelete = !session.title
            && isEmpty(session.raw_memo_html)
            && isEmpty(session.enhanced_memo_html)
            && session.words.length === 0
            && !hasChatMessages
            && ongoingSessionId !== session.id
            && !isRecentlyCreated
            && !isYouTubeImport;

          console.log("🧹 [Route Cleanup] Session analysis:", {
            sessionId: session.id,
            title: session.title || "(empty)",
            shouldDelete,
          });

          if (shouldDelete && isActive) {
            console.log("🗑️ [Route Cleanup] Deleting empty session:", session.id);
            await dbCommands.deleteSession(session.id);
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
          }
        } catch (error) {
          console.error("🧹 [Route Cleanup] Error:", error);
        }
      }, 100);

      // Cleanup the timeout if effect runs again
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionId, getLatestSession, getOngoingSession, queryClient]);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1">
        <main
          className={cn([
            "relative flex h-full overflow-hidden bg-background",
            "min-w-0",
          ])}
        >
          <div className="h-full flex-1">
            <OnboardingSupport session={session} />
            <EditorArea key={sessionId} editable={getCurrentWebviewWindowLabel() === "main"} sessionId={sessionId} />
          </div>
          <FloatingMeetingAssistant />
        </main>
      </div>
    </div>
  );
}

function OnboardingSupport({ session }: { session: Session }) {
  const video = "SGv6JaZsKqF50102xk6no2ybUqqSyngeWO401ic8qJdZR4";

  const navigate = useNavigate();

  const { onboardingSessionId } = useTypr();

  const isEnhancePending = useEnhancePendingState(session.id);

  const { stopOngoingSession, ongoingSessionId, ongoingSessionStatus } = useOngoingSession((
    s,
  ) => ({
    stopOngoingSession: s.stop,
    ongoingSessionId: s.sessionId,
    ongoingSessionStatus: s.status,
  }));

  // we want to "stop-and-go-back" from anywhere, when onboarding video is destroyed.
  useEffect(() => {
    let disposed = false;
    let unlisten: () => void;

    windowsEvents.windowDestroyed.listen(({ payload: { window } }) => {
      if (window.type === "video" && window.value === video) {
        stopOngoingSession();

        if (onboardingSessionId) {
          navigate({ to: "/app/note/$id", params: { id: onboardingSessionId } });
        }
      }
    }).then((u) => {
      if (disposed) {
        safeUnlisten(u, "app.note.windowDestroyed.listener.late-dispose");
        return;
      }

      unlisten = u;
    }).catch((error) => {
      console.error("[events] Failed to register windowDestroyed listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "app.note.windowDestroyed.listener");
    };
  }, []);

  useEffect(() => {
    if (onboardingSessionId !== ongoingSessionId) {
      return;
    }

    if (isEnhancePending) {
      return;
    }

    if (ongoingSessionStatus === "running_active") {
      windowsCommands.windowShow({ type: "video", value: video });
    }
  }, [onboardingSessionId, session.id, isEnhancePending, ongoingSessionStatus]);

  return null;
}
