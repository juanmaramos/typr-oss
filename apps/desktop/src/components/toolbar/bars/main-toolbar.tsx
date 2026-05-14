import {
  COLLAPSED_MAIN_PANEL_MAC_TITLEBAR_INSET_CLASS,
  COLLAPSED_MAIN_PANEL_TITLEBAR_INSET_CLASS,
} from "@/components/app-shell/titlebar-layout";
import { AskConversationToolbar } from "@/components/ask/ask-conversation-toolbar";
import { Button } from "@typr/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useMatch, useNavigate, useSearch } from "@tanstack/react-router";

import { NewNoteButton } from "@/components/toolbar/buttons/new-note-button";
import { NewWindowButton } from "@/components/toolbar/buttons/new-window-button";
import { useLeftSidebar } from "@/contexts";
import { getProject, projectQueryKeys } from "@/lib/projects";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { type as getOsType } from "@tauri-apps/plugin-os";

export function MainToolbar() {
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const askThreadMatch = useMatch({ from: "/app/ask/$threadId", shouldThrow: false });
  const projectsIndexMatch = useMatch({ from: "/app/projects", shouldThrow: false });
  const projectDetailMatch = useMatch({ from: "/app/projects/$projectId", shouldThrow: false });
  const organizationMatch = useMatch({
    from: "/app/organization/$id",
    shouldThrow: false,
  });
  const humanMatch = useMatch({ from: "/app/human/$id", shouldThrow: false });
  const isNote = !!noteMatch;
  const isProjects = !!projectsIndexMatch || !!projectDetailMatch;
  const isMain = getCurrentWebviewWindowLabel() === "main";
  const { isExpanded: isLeftSidebarExpanded } = useLeftSidebar();
  const noteSearch = useSearch({ from: "/app/note/$id", shouldThrow: false });
  const backProjectId = noteSearch?.projectId ?? noteSearch?.spaceId;
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });
  const needsCollapsedSidebarInset = isNote && isMain && !isLeftSidebarExpanded;
  const collapsedSidebarInsetClassName = osType.data === "windows" || osType.data === "linux"
    ? COLLAPSED_MAIN_PANEL_TITLEBAR_INSET_CLASS
    : COLLAPSED_MAIN_PANEL_MAC_TITLEBAR_INSET_CLASS;

  if (askThreadMatch) {
    return <AskConversationToolbar threadId={askThreadMatch.params.threadId} />;
  }

  return (
    <header
      data-tauri-drag-region
      className={cn([
        "flex h-11 w-full items-center justify-between px-3 transition-[padding] duration-200 ease-out",
        isNote && isMain && "pr-12",
        needsCollapsedSidebarInset && collapsedSidebarInsetClassName,
        // Background color handling
        isMain && !isProjects
          ? "bg-background/75 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/60"
          : "bg-transparent border-transparent",
      ])}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        {isNote && isMain && (noteSearch?.from === "project" || noteSearch?.from === "space") && backProjectId && (
          <BackToProjectButton projectId={backProjectId} />
        )}
      </div>

      <div className="flex min-w-[180px] items-center justify-end gap-2" data-tauri-drag-region>
        {isMain && (
          <>
            {isNote && <NewNoteButton />}
            {(organizationMatch || humanMatch) && <NewWindowButton />}
          </>
        )}
      </div>
    </header>
  );
}

function BackToProjectButton({ projectId }: { projectId: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const projectQuery = useQuery({
    queryKey: [projectQueryKeys.detail, projectId],
    queryFn: () => getProject(projectId),
  });

  if (!projectQuery.data) {
    return null;
  }

  const label = t`Back to ${projectQuery.data.name}`;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 min-w-0 max-w-full shrink rounded-xl px-3 text-xs font-medium text-muted-foreground hover:bg-surface-400/70 hover:text-foreground"
      onClick={() => navigate({ to: "/app/projects/$projectId", params: { projectId } })}
      aria-label={label}
      title={label}
    >
      <i className="ri-arrow-left-line shrink-0 text-sm" />
      <span className="min-w-0 truncate">
        <Trans>Back to {projectQuery.data.name}</Trans>
      </span>
    </Button>
  );
}
