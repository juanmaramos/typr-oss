import { getSpaceActionErrorMessage } from "@/lib/spaces";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@typr/ui/components/ui/dialog";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

interface SpaceNotesPickerDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string;
  userId: string | null | undefined;
}

export function SpaceNotesPickerDialog({ onOpenChange, open, spaceId, userId }: SpaceNotesPickerDialogProps) {
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
    queryKey: ["space-note-candidates", spaceId, userId, deferredQuery],
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

  const assignMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      await Promise.all(sessionIds.map(sessionId => dbCommands.assignSessionToSpace(sessionId, spaceId)));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        predicate: query => ["spaces", "space", "space-sessions", "session"].includes(String(query.queryKey[0])),
      });

      setSelectedSessionIds([]);
      setQuery("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        id: "spaces-add-notes-error",
        title: <Trans>Couldn’t add notes</Trans>,
        content: getSpaceActionErrorMessage(error),
      });
    },
  });

  const availableSessions = useMemo(
    () => (sessionsQuery.data ?? []).filter(session => session.space_id == null),
    [sessionsQuery.data],
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
      <DialogContent className="max-w-[820px] gap-0 overflow-hidden rounded-[28px] border bg-background p-0 shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-0 text-left">
          <DialogTitle className="text-lg font-semibold text-foreground">
            <Trans>Add notes</Trans>
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Search recent notes and add the ones you want to keep in this project. Only unassigned notes appear here.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4">
          <Command
            shouldFilter={false}
            className="overflow-hidden rounded-[24px] border border bg-background shadow-none"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t`Search notes to add...`}
              className="h-12 text-sm"
            />

            <CommandList className="max-h-[420px] px-2 pb-3">
              {sessionsQuery.isLoading
                ? (
                  <div className="space-y-3 px-2 py-3">
                    {Array.from({ length: 5 }, (_, index) => <SpaceCandidateRowSkeleton key={index} />)}
                  </div>
                )
                : (
                  <>
                    <CommandEmpty className="py-10 text-center">
                      <div className="text-sm font-medium text-foreground">
                        <Trans>No notes ready to add</Trans>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {deferredQuery
                          ? <Trans>Try another search.</Trans>
                          : <Trans>Create or unassign a note first, then it will appear here.</Trans>}
                      </p>
                    </CommandEmpty>

                    {groupedSessions.map(([label, sessions]) => (
                      <CommandGroup key={label} heading={label} className="px-1 py-2">
                        {sessions.map((session) => {
                          const timestamp = session.record_start ?? session.created_at;
                          const isSelected = selectedSessionIds.includes(session.id);

                          return (
                            <CommandItem
                              key={session.id}
                              value={`${session.title}-${session.id}`}
                              onSelect={() => toggleSelection(session.id)}
                              className={cn(
                                "gap-3 rounded-xl px-3 py-3 data-[selected=true]:bg-muted/50 data-[selected=true]:text-foreground",
                                isSelected && "bg-muted/50",
                              )}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none mt-0.5" />

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {session.title || <Trans>Untitled note</Trans>}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{format(new Date(timestamp), "h:mm a")}</span>
                                  {session.words.length > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                      <i className="ri-mic-line text-[12px]" />
                                      <Trans>Transcript</Trans>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </>
                )}
            </CommandList>
          </Command>
        </div>

        <DialogFooter className="mt-4 items-center justify-between border-t border px-6 py-4 sm:flex-row sm:space-x-0">
          <p className="text-sm text-muted-foreground">
            {selectedCount > 0 ? <Trans>{selectedCount} selected</Trans> : <Trans>Select one or more notes</Trans>}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={selectedCount === 0 || assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedSessionIds)}
            >
              <i className="ri-add-line mr-1 text-base" />
              {selectedCount === 1 ? <Trans>Add note</Trans> : <Trans>Add {selectedCount} notes</Trans>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpaceCandidateRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-3">
      <Skeleton className="mt-1 h-4 w-4 rounded-sm" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-[18rem] max-w-full rounded-full" />
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
