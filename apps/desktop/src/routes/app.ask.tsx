import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

export const Route = createFileRoute("/app/ask")({
  validateSearch: zodValidator(z.object({ projectId: z.string().optional() })),
  beforeLoad: ({ location, search }) => {
    if (location.pathname !== "/app/ask") {
      return;
    }
    if (search.projectId) {
      throw redirect({
        to: "/app/projects/$projectId",
        params: { projectId: search.projectId },
        search: { tab: "chats" },
        replace: true,
      });
    }
    throw redirect({ to: "/app/projects", replace: true });
  },
  component: Outlet,
});
