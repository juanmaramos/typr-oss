import {
  COLLAPSED_MAIN_PANEL_MAC_TITLEBAR_INSET_CLASS,
  COLLAPSED_MAIN_PANEL_TITLEBAR_INSET_CLASS,
} from "@/components/app-shell/titlebar-layout";
import { ProjectIcon } from "@/components/projects/project-icon";
import { useTypr, useLeftSidebar } from "@/contexts";
import { askQueryKeys, createAskThread, getAskThread, listAskThreads } from "@/lib/ask";
import { getProject, listProjects, type Project, projectQueryKeys } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import type { AskThread } from "@typr/plugin-db";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { differenceInCalendarDays, format } from "date-fns";
import { useMemo, useState } from "react";

interface AskConversationToolbarProps {
  threadId: string;
}

const toolbarIconButtonClassName = "size-8 rounded-md text-muted-foreground hover:bg-surface-400 hover:text-foreground";
const toolbarTitleClassName = "min-w-0 truncate text-xs font-semibold text-foreground";

export function AskConversationToolbar({ threadId }: AskConversationToolbarProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const { isExpanded: isLeftSidebarExpanded } = useLeftSidebar();
  const isMainWindow = getCurrentWebviewWindowLabel() === "main";

  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });

  const threadQuery = useQuery({
    queryKey: [askQueryKeys.thread, threadId],
    queryFn: () => getAskThread(threadId),
  });

  const thread = threadQuery.data;

  const projectQuery = useQuery({
    queryKey: [projectQueryKeys.detail, thread?.scope_id],
    queryFn: () => getProject(thread!.scope_id!),
    enabled: thread?.scope_type === "Project" && Boolean(thread.scope_id),
  });

  const threadsQuery = useQuery({
    queryKey: [askQueryKeys.threads, userId],
    queryFn: () => listAskThreads(userId!, null, null),
    enabled: Boolean(userId),
  });

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const projectById = useMemo(
    () => new Map((projectsQuery.data ?? []).map(project => [project.id, project])),
    [projectsQuery.data],
  );

  const createScopedThreadMutation = useMutation({
    mutationFn: async () => {
      if (!thread || thread.scope_type !== "Project" || !thread.scope_id) {
        throw new Error(t`New chat is only available for project-scoped Ask threads.`);
      }

      return createAskThread({
        userId: thread.user_id,
        scope: { type: "Project", id: thread.scope_id },
      });
    },
    onSuccess: async (nextThread) => {
      if (nextThread.scope_id) {
        trackEvent("ask_thread_created", userId, {
          project_id: nextThread.scope_id,
          source: "thread_new_chat",
          has_initial_prompt: false,
        });
      }
      await queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] });
      navigate({ to: "/app/ask/$threadId", params: { threadId: nextThread.id } });
    },
    onError: (error) => {
      toast({
        id: "ask-create-scoped-thread-error",
        title: <Trans>Couldn’t start new chat</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    },
  });

  const project = projectQuery.data;
  const needsCollapsedSidebarInset = isMainWindow && !isLeftSidebarExpanded;
  const collapsedSidebarInsetClassName = osType.data === "windows" || osType.data === "linux"
    ? COLLAPSED_MAIN_PANEL_TITLEBAR_INSET_CLASS
    : COLLAPSED_MAIN_PANEL_MAC_TITLEBAR_INSET_CLASS;

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-11 w-full items-center justify-between border-b border-border/60 bg-background/75 px-3 backdrop-blur-md backdrop-saturate-150 transition-[padding] duration-200 ease-out supports-[backdrop-filter]:bg-background/60",
        needsCollapsedSidebarInset && collapsedSidebarInsetClassName,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(toolbarIconButtonClassName, "shrink-0")}
          onClick={() =>
            navigate({
              to: "/app/ask",
              search: project ? { projectId: project.id } : {},
            })}
          aria-label={t`Back to Ask`}
          title={t`Back to Ask`}
        >
          <i className="ri-arrow-left-line text-lg" />
        </Button>

        <h1 className={toolbarTitleClassName}>
          {thread?.title || <Trans>Untitled conversation</Trans>}
        </h1>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5" data-tauri-drag-region>
        <AskHistoryPopover
          currentThreadId={threadId}
          isLoading={threadsQuery.isLoading}
          projectById={projectById}
          threads={threadsQuery.data ?? []}
          onSelectThread={(nextThreadId) =>
            navigate({
              to: "/app/ask/$threadId",
              params: { threadId: nextThreadId },
            })}
        />

        {project && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={toolbarIconButtonClassName}
            disabled={createScopedThreadMutation.isPending}
            onClick={() => createScopedThreadMutation.mutate()}
            aria-label={t`New chat`}
            title={t`New chat`}
          >
            <i className="ri-add-line text-base" />
          </Button>
        )}

        {project && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={toolbarIconButtonClassName}
            onClick={() => navigate({ to: "/app/projects/$projectId", params: { projectId: project.id } })}
            aria-label={t`Open project`}
            title={t`Open project`}
          >
            <i className="ri-folder-open-line text-base" />
          </Button>
        )}
      </div>
    </header>
  );
}

function AskHistoryPopover({
  currentThreadId,
  isLoading,
  onSelectThread,
  projectById,
  threads,
}: {
  currentThreadId: string;
  isLoading: boolean;
  onSelectThread: (threadId: string) => void;
  projectById: Map<string, Project>;
  threads: AskThread[];
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const groupedThreads = useMemo(() => groupAskThreadsByRecency(threads, t), [threads, t]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            toolbarIconButtonClassName,
            "data-[state=open]:bg-surface-400 data-[state=open]:text-foreground",
          )}
          aria-label={t`Show Ask history`}
          title={t`History`}
        >
          <i className="ri-history-line text-base" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 rounded-xl border bg-background p-2 shadow-lg sm:w-96">
        {isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-9 rounded-lg" />)}
          </div>
        )}

        {!isLoading && groupedThreads.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            <Trans>No Ask conversations yet.</Trans>
          </div>
        )}

        {!isLoading && groupedThreads.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            {groupedThreads.map(group => (
              <div key={group.label} className="py-1">
                <div className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.threads.map(thread => {
                    const isSelected = thread.id === currentThreadId;
                    const project = thread.scope_id ? projectById.get(thread.scope_id) : null;

                    return (
                      <button
                        key={thread.id}
                        type="button"
                        className={cn(
                          "flex h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors",
                          "hover:bg-surface-400 focus-visible:bg-surface-400 focus-visible:outline-none",
                          isSelected && "bg-surface-400",
                        )}
                        aria-current={isSelected ? "page" : undefined}
                        onClick={() => {
                          if (!isSelected) {
                            onSelectThread(thread.id);
                          }
                          setOpen(false);
                        }}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                          {project
                            ? (
                              <ProjectIcon
                                icon={project.icon_value}
                                color={project.icon_color}
                                size="sm"
                                className="ring-0"
                              />
                            )
                            : <i className="ri-chat-3-line text-base" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {thread.title || <Trans>Untitled conversation</Trans>}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatAskThreadTime(thread)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function groupAskThreadsByRecency(threads: AskThread[], t: ReturnType<typeof useLingui>["t"]) {
  const groups = new Map<string, AskThread[]>();
  const now = new Date();

  for (const thread of threads) {
    const timestamp = getAskThreadDate(thread);
    const ageInDays = Math.max(0, differenceInCalendarDays(now, timestamp));
    const label = ageInDays <= 3
      ? t`Last 3 days`
      : ageInDays <= 14
      ? t`Last 2 weeks`
      : format(timestamp, timestamp.getFullYear() === now.getFullYear() ? "MMMM" : "MMMM yyyy");

    groups.set(label, [...(groups.get(label) ?? []), thread]);
  }

  return Array.from(groups, ([label, groupThreads]) => ({ label, threads: groupThreads }));
}

function getAskThreadDate(thread: AskThread) {
  return new Date(thread.last_message_at ?? thread.updated_at);
}

function formatAskThreadTime(thread: AskThread) {
  return format(getAskThreadDate(thread), "MMM d");
}
