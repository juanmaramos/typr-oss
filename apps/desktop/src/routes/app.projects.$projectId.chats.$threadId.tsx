import { ProjectChat } from "@/components/ask/project-chat";
import { getAskThread } from "@/lib/ask";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/projects/$projectId/chats/$threadId")({
  beforeLoad: async ({ params }) => {
    const thread = await getAskThread(params.threadId);
    if (thread?.scope_type === "Project" && thread.scope_id && thread.scope_id !== params.projectId) {
      throw redirect({
        to: "/app/projects/$projectId/chats/$threadId",
        params: { projectId: thread.scope_id, threadId: thread.id },
        replace: true,
      });
    }
  },
  component: Component,
});

function Component() {
  const { projectId, threadId } = Route.useParams();
  return <ProjectChat key={threadId} projectId={projectId} threadId={threadId} />;
}
