import { AskPageShell } from "@/components/ask/ask-page-shell";
import { ProjectIcon } from "@/components/projects/project-icon";
import { useTypr } from "@/contexts";
import { archiveAskThread, askQueryKeys, createAskThread, listAskMessages, listAskThreads } from "@/lib/ask";
import { listProjects, projectQueryKeys } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Input } from "@typr/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

export const Route = createFileRoute("/app/ask")({
  validateSearch: zodValidator(z.object({ projectId: z.string().optional() })),
  component: Component,
});

function Component() {
  const location = useLocation();

  if (location.pathname !== "/app/ask") {
    return <Outlet />;
  }

  return <AskHome />;
}

function AskHome() {
  const { t } = useLingui();
  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(searchParams.projectId ?? null);

  const threadsQuery = useQuery({
    queryKey: [askQueryKeys.threads, userId],
    queryFn: () => listAskThreads(userId!, null, null),
    enabled: Boolean(userId),
  });

  const projectsQuery = useQuery({
    queryKey: [projectQueryKeys.all],
    queryFn: listProjects,
  });

  const messageQueries = useQueries({
    queries: (threadsQuery.data ?? []).map(thread => ({
      queryKey: [askQueryKeys.messages, thread.id],
      queryFn: () => listAskMessages(thread.id),
    })),
  });

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error(t`Missing user`);
      }

      if (!selectedProjectId) {
        throw new Error(t`Choose a project before starting a new Ask chat.`);
      }

      return createAskThread({
        userId,
        scope: { type: "Project", id: selectedProjectId },
      });
    },
    onSuccess: async (thread) => {
      if (thread.scope_id) {
        trackEvent("ask_thread_created", userId, {
          project_id: thread.scope_id,
          source: "ask_home",
          has_initial_prompt: false,
        });
      }
      await queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] });
      navigate({ to: "/app/ask/$threadId", params: { threadId: thread.id } });
    },
    onError: (error) => {
      toast({
        id: "ask-new-chat-error",
        title: <Trans>Couldn’t start new chat</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    },
  });

  const archiveThreadMutation = useMutation({
    mutationFn: archiveAskThread,
    onSuccess: async (_result, threadId) => {
      const thread = (threadsQuery.data ?? []).find(thread => thread.id === threadId);
      trackEvent("ask_thread_archived", userId, {
        thread_id: threadId,
        ...(thread?.scope_id ? { project_id: thread.scope_id } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] });
    },
    onError: (error) => {
      toast({
        id: "ask-archive-thread-error",
        title: <Trans>Couldn’t remove conversation</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    },
  });

  useEffect(() => {
    setSelectedProjectId(searchParams.projectId ?? null);
  }, [searchParams.projectId]);

  const projectById = useMemo(
    () => new Map((projectsQuery.data ?? []).map(project => [project.id, project])),
    [projectsQuery.data],
  );

  const firstUserMessageByThreadId = useMemo(
    () =>
      new Map(
        (threadsQuery.data ?? []).map((thread, index) => {
          const firstUserMessage = (messageQueries[index]?.data ?? []).find(message => message.role === "User");
          return [thread.id, firstUserMessage?.content ?? ""];
        }),
      ),
    [messageQueries, threadsQuery.data],
  );

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (threadsQuery.data ?? []).filter(thread => {
      if (selectedProjectId && thread.scope_id !== selectedProjectId) {
        return false;
      }

      if (!query) {
        return true;
      }

      const project = thread.scope_id ? projectById.get(thread.scope_id) : null;
      const firstUserMessage = firstUserMessageByThreadId.get(thread.id) ?? "";
      const haystack = [
        thread.title,
        firstUserMessage,
        project?.name,
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(query);
    });
  }, [firstUserMessageByThreadId, projectById, search, selectedProjectId, threadsQuery.data]);

  const selectedProject = selectedProjectId ? projectById.get(selectedProjectId) : null;
  const hasThreads = (threadsQuery.data ?? []).length > 0;

  const setProjectFilter = (nextProjectId: string | null) => {
    setSelectedProjectId(nextProjectId);
    navigate({
      to: "/app/ask",
      search: nextProjectId ? { projectId: nextProjectId } : {},
      replace: true,
    });
  };

  const clearFilters = () => {
    setSearch("");
    setProjectFilter(null);
  };

  const emptyAction = selectedProjectId || search.trim()
    ? { label: t`Clear filters`, onClick: clearFilters }
    : { label: t`Open projects`, onClick: () => navigate({ to: "/app/projects" }) };

  const projectOptions = useMemo(
    () => [...(projectsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [projectsQuery.data],
  );

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <AskPageShell className="pb-8 pt-8">
        <div className="shrink-0 space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="typography-h2 text-foreground">
                <Trans>Ask</Trans>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                <Trans>
                  Ask uses project knowledge. Start from a project, or choose one here, to chat with its notes and
                  files.
                </Trans>
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-9 shrink-0"
              disabled={!selectedProjectId || createThreadMutation.isPending}
              onClick={() => createThreadMutation.mutate()}
            >
              <i className="ri-add-line mr-1 text-base" />
              <Trans>New chat</Trans>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t`Search conversations`}
              className="h-9 rounded-xl border bg-background text-sm"
            />
            <Select
              value={selectedProjectId ?? "all"}
              onValueChange={value => setProjectFilter(value === "all" ? null : value)}
            >
              <SelectTrigger className="h-9 w-64 rounded-xl border bg-background text-sm">
                <SelectValue placeholder={t`All projects`} />
              </SelectTrigger>
              <SelectContent align="end" className="max-h-72 rounded-xl border bg-background p-1.5">
                <SelectItem value="all" className="rounded-lg">
                  <Trans>All projects</Trans>
                </SelectItem>
                {projectOptions.map(project => (
                  <SelectItem key={project.id} value={project.id} className="rounded-lg">
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProject && (
            <div className="flex w-fit items-center gap-2 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <ProjectIcon icon={selectedProject.icon_value} color={selectedProject.icon_color} size="sm" />
              <span className="max-w-64 truncate">{selectedProject.name}</span>
              <span>·</span>
              <span>
                <Trans>Whole project</Trans>
              </span>
            </div>
          )}
        </div>

        <div className="mt-8 min-h-0 flex-1">
          {threadsQuery.isLoading && (
            <div className="space-y-3">
              {Array.from(
                { length: 5 },
                (_, index) => (
                  <div key={index} className="flex items-center gap-3 border-b border-border/60 px-3 py-3">
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-80 max-w-full rounded-full" />
                      <Skeleton className="mt-2 h-3 w-44 rounded-full" />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {!threadsQuery.isLoading && (!hasThreads || filteredThreads.length === 0) && (
            <div className="flex h-full items-center justify-center px-8 py-12 text-center">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {selectedProjectId || search.trim()
                    ? <Trans>No matching conversations</Trans>
                    : <Trans>No Ask conversations yet</Trans>}
                </div>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  {selectedProjectId || search.trim()
                    ? <Trans>Try a different search or project filter.</Trans>
                    : <Trans>Open a project and ask a question grounded in its notes and files.</Trans>}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-5"
                  onClick={emptyAction.onClick}
                >
                  {emptyAction.label}
                </Button>
              </div>
            </div>
          )}

          {!threadsQuery.isLoading && filteredThreads.length > 0 && (
            <div className="divide-y divide-border/60">
              {filteredThreads.map(thread => {
                const project = thread.scope_id ? projectById.get(thread.scope_id) : null;

                return (
                  <div
                    key={thread.id}
                    className="group flex w-full items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-400/50"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-w-0 flex-1 justify-start gap-3 rounded-lg px-0 py-0 text-left whitespace-normal hover:bg-transparent"
                      onClick={() =>
                        navigate({
                          to: "/app/ask/$threadId",
                          params: { threadId: thread.id },
                        })}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <i className="ri-chat-3-line text-base" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {thread.title || <Trans>Untitled conversation</Trans>}
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {project
                            ? (
                              <>
                                <ProjectIcon
                                  icon={project.icon_value}
                                  color={project.icon_color}
                                  size="sm"
                                  className="ring-0"
                                />
                                <span className="truncate">{project.name}</span>
                              </>
                            )
                            : (
                              <span>
                                <Trans>Ask conversation</Trans>
                              </span>
                            )}
                        </div>
                      </div>
                    </Button>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(thread.last_message_at ?? thread.updated_at), {
                          addSuffix: true,
                        })}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-400 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label={t`Conversation actions`}
                          >
                            <i className="ri-more-2-fill text-base" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            className="whitespace-nowrap text-destructive focus:text-destructive"
                            disabled={archiveThreadMutation.isPending}
                            onSelect={() => archiveThreadMutation.mutate(thread.id)}
                          >
                            <i className="ri-delete-bin-line text-sm" />
                            <Trans>Remove conversation</Trans>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AskPageShell>
    </div>
  );
}
