import { projectBriefQueryKeys } from "@/lib/project-briefs";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import {
  assignSessionToProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  listProjectSources,
  projectQueryKeys,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { commands as dbCommands, type Session } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Checkbox } from "@typr/ui/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@typr/ui/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@typr/ui/components/ui/dialog";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

interface ProjectNotesPickerDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: string;
  userId: string | null | undefined;
}

export function ProjectNotesPickerDialog({ onOpenChange, open, projectId, userId }: ProjectNotesPickerDialogProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    if (open) {
      return;
    }

    setQuery("");
    setSelectedSessionIds([]);
  }, [open]);

  const sessionsQuery = useQuery({
    queryKey: [projectQueryKeys.noteCandidates, projectId, userId, deferredQuery],
    enabled: open && Boolean(userId),
    queryFn: async () => {
      if (!userId) {
        return [] as Session[];
      }

      if (deferredQuery) {
        return dbCommands.listSessions({
          type: "search",
          query: deferredQuery,
          limit: 60,
          user_id: userId,
        });
      }

      return dbCommands.listSessions({
        type: "recentlyVisited",
        limit: 80,
        user_id: userId,
      });
    },
  });

  const projectSourcesQuery = useQuery({
    queryKey: [projectQueryKeys.sources, projectId],
    queryFn: () => listProjectSources(projectId),
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      await Promise.all(sessionIds.map(sessionId => assignSessionToProject(sessionId, projectId)));
    },
    onSuccess: async (_result, sessionIds) => {
      if (userId) {
        trackEvent("project_notes_added", userId, {
          project_id: projectId,
          note_count: sessionIds.length,
          source: "project_picker",
        });
      }
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: query => isProjectQueryKey(query.queryKey[0]),
        }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);

      setSelectedSessionIds([]);
      setQuery("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        id: "projects-add-notes-error",
        title: <Trans>Couldn’t add notes</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const currentProjectSessionIds = useMemo(
    () => new Set((projectSourcesQuery.data ?? []).map(source => source.session_id)),
    [projectSourcesQuery.data],
  );

  const availableSessions = useMemo(
    () => (sessionsQuery.data ?? []).filter(session => !currentProjectSessionIds.has(session.id)),
    [currentProjectSessionIds, sessionsQuery.data],
  );

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, Session[]>();

    for (const session of availableSessions) {
      const timestamp = session.record_start ?? session.created_at;
      const label = format(new Date(timestamp), "EEE, MMM d");
      const existing = groups.get(label);

      if (existing) {
        existing.push(session);
      } else {
        groups.set(label, [session]);
      }
    }

    return Array.from(groups.entries());
  }, [availableSessions]);

  const toggleSelection = (sessionId: string) => {
    setSelectedSessionIds((current) => (
      current.includes(sessionId)
        ? current.filter(id => id !== sessionId)
        : [...current, sessionId]
    ));
  };

  const selectedCount = selectedSessionIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden border bg-background p-0">
        <DialogTitle className="sr-only">
          <Trans>Add notes</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Search and select notes to add to this project.</Trans>
        </DialogDescription>

        <Command
          shouldFilter={false}
          className={cn(
            "rounded-none border-0 bg-background shadow-none",
            "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs",
            "[&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2",
          )}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t`Search notes...`}
            className="h-11 text-sm"
          />

          <CommandList className="max-h-[420px] px-2 py-2">
            {sessionsQuery.isLoading || projectSourcesQuery.isLoading
              ? (
                <div className="space-y-1 px-1 py-1">
                  {Array.from({ length: 6 }, (_, index) => <ProjectCandidateRowSkeleton key={index} />)}
                </div>
              )
              : (
                <>
                  <CommandEmpty className="py-10 text-center">
                    <div className="text-sm font-medium text-foreground">
                      <Trans>No notes ready to add</Trans>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {deferredQuery
                        ? <Trans>Try another search.</Trans>
                        : <Trans>All notes that are not already in this project appear here.</Trans>}
                    </p>
                  </CommandEmpty>

                  {groupedSessions.map(([label, sessions]) => (
                    <CommandGroup key={label} heading={label} className="px-0 py-1">
                      {sessions.map((session) => {
                        const timestamp = session.record_start ?? session.created_at;
                        const isSelected = selectedSessionIds.includes(session.id);

                        return (
                          <CommandItem
                            key={session.id}
                            value={`${session.title}-${session.id}`}
                            onSelect={() => toggleSelection(session.id)}
                            className={cn(
                              "gap-3 rounded-md data-[selected=true]:bg-muted/50 data-[selected=true]:text-foreground",
                              isSelected && "bg-muted/50",
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              className={cn(
                                "pointer-events-none size-4 rounded-[4px]",
                                !isSelected && "border-muted-foreground/30 shadow-none",
                              )}
                            />

                            <i className="ri-sticky-note-line text-base text-muted-foreground" />

                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {session.title || <Trans>Untitled note</Trans>}
                            </span>

                            <span className="shrink-0 text-xs text-muted-foreground">
                              {format(new Date(timestamp), "MMM d")}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </>
              )}
          </CommandList>
        </Command>

        {selectedCount > 0 && (
          <DialogFooter className="items-center justify-end border-t px-4 py-3 sm:flex-row sm:space-x-0">
            <Button
              type="button"
              size="default"
              className="min-w-28"
              disabled={assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedSessionIds)}
            >
              {selectedCount === 1 ? <Trans>Add note</Trans> : <Trans>Add {selectedCount} notes</Trans>}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectCandidateRowSkeleton() {
  return (
    <div className="flex h-9 items-center gap-3 rounded-md px-2">
      <Skeleton className="size-4 rounded-[4px]" />
      <Skeleton className="size-4 rounded-sm" />
      <Skeleton className="h-3.5 w-56 max-w-full rounded-full" />
      <Skeleton className="ml-auto h-3 w-10 rounded-full" />
    </div>
  );
}
