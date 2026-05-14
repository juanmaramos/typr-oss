import { debugLog } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { commands as dbCommands } from "@typr/plugin-db";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/app/")({
  component: Component,
});

function Component() {
  const navigate = useNavigate();
  const { userId } = useTypr();
  const [, setStatus] = useState<"loading" | "redirecting" | "creating">("loading");

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;

    const resolveWorkspace = async () => {
      setStatus("loading");

      try {
        // Read directly from DB to avoid stale query-cache races after deletes.
        const sessions = await dbCommands.listSessions({
          type: "recentlyVisited",
          user_id: userId,
          limit: 1,
        });
        debugLog("[Workspace] resolve", {
          userId,
          count: sessions.length,
          latestSessionId: sessions[0]?.id ?? null,
        });

        if (cancelled) {
          return;
        }

        const latestSession = sessions[0];
        if (latestSession) {
          setStatus("redirecting");
          debugLog("[Workspace] redirecting to latest note", {
            sessionId: latestSession.id,
            title: latestSession.title,
          });
          navigate({
            to: "/app/note/$id",
            params: { id: latestSession.id },
            replace: true,
          });
          return;
        }

        setStatus("creating");
        debugLog("[Workspace] creating first note");
        navigate({
          to: "/app/new",
          replace: true,
        });
      } catch (error) {
        console.error("[Workspace] Failed to resolve latest session:", error);
        if (!cancelled) {
          setStatus("creating");
          navigate({
            to: "/app/new",
            replace: true,
          });
        }
      }
    };

    resolveWorkspace();

    return () => {
      cancelled = true;
    };
  }, [userId, navigate]);

  return (
    <div className="flex h-full flex-col px-8 pt-6">
      {/* Title area */}
      <div className="space-y-3 mb-6">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      {/* Editor lines */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/6" />
      </div>
    </div>
  );
}
