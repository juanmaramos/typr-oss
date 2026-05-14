import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/spaces/$spaceId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/projects/$projectId",
      params: { projectId: params.spaceId },
      replace: true,
    });
  },
});
