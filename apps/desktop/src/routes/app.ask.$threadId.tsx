import { getAskThread } from "@/lib/ask";
import { createFileRoute, redirect } from "@tanstack/react-router";

// Keep bookmarked conversation links working after moving chats into projects.
export const Route = createFileRoute("/app/ask/$threadId")({
  beforeLoad: async ({ params }) => {
    const thread = await getAskThread(params.threadId);
    if (thread?.scope_type === "Project" && thread.scope_id) {
      throw redirect({
        to: "/app/projects/$projectId/chats/$threadId",
        params: { projectId: thread.scope_id, threadId: thread.id },
        replace: true,
      });
    }
    throw redirect({ to: "/app/projects", replace: true });
  },
});
