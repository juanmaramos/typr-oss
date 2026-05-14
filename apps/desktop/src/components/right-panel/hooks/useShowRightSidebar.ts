import { useRightPanel } from "@/contexts";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { useMatch } from "@tanstack/react-router";

export function useShowRightSidebar(): boolean {
  const { currentView, isExpanded, surface } = useRightPanel();
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const projectMatch = useMatch({ from: "/app/projects/$projectId", shouldThrow: false });
  const isAllowedRoute = currentView === "project-brief"
    ? Boolean(projectMatch?.params.projectId)
    : Boolean(noteMatch?.params.id);

  return getCurrentWebviewWindowLabel() === "main"
    && surface === "sidebar"
    && isExpanded
    && isAllowedRoute;
}
