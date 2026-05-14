import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/spaces")({
  beforeLoad: () => {
    throw redirect({ to: "/app/projects", replace: true });
  },
});
