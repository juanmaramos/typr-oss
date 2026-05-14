import { i18n } from "@lingui/core";
import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react/macro";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { confirm } from "@tauri-apps/plugin-dialog";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDownIcon, TrashIcon } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as Collapsible from "@radix-ui/react-collapsible";

import { MarqueeTitle } from "@/components/left-sidebar/marquee-title";
import { Loader } from "@/components/ui/loader";
import { debugLog } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { useEnhancePendingState } from "@/hooks/enhance-pending";
import { useMultiSelectKeyboard } from "@/hooks/useMultiSelectKeyboard";
import { useMultiSelectNotes } from "@/stores/useMultiSelectNotes";
import { deleteSessionWithWelcomeDismissal } from "@/utils/delete-session";
import { removeSessionsFromCache } from "@/utils/session-cache";
import { commands as dbCommands, type Event, type Session } from "@typr/plugin-db";
import { commands as miscCommands } from "@typr/plugin-misc";
import { Checkbox } from "@typr/ui/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { cn } from "@typr/ui/lib/utils";
import { useSession, useSessions } from "@typr/utils/contexts";
import { formatDate, formatTimeLocale } from "@typr/utils/datetime";
import * as FNS from "date-fns";

interface NotesListProps {
  filter: (session: Session) => boolean;
  ongoingSessionId?: string | null;
  activeSessionId?: string;
}

type SessionWithEvent = Session & {
  event: Event | null;
};

export default function NotesList({
  ongoingSessionId,
  filter,
  activeSessionId,
}: NotesListProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useRef<HTMLElement | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const { insertSession, sessionsStore } = useSessions((s) => ({
    insertSession: s.insert,
    sessionsStore: s.sessions,
  }));

  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const sessions = useInfiniteQuery({
    queryKey: ["sessions"],
    queryFn: async ({ pageParam: { monthOffset } }) => {
      const now = new Date();
      const [from, to] = [startOfMonth(now), endOfMonth(now)]
        .map((d) => subMonths(d, monthOffset))
        .map((d) => d.toISOString());

      const sessions = await dbCommands.listSessions({
        type: "dateRange",
        user_id: userId,
        start: from,
        end: to,
        limit: 100,
      });
      // Only create stores for sessions not yet in memory.
      // Existing stores are the authority — they have the latest local state
      // (edits, enhancement, title generation). Refreshing existing stores
      // happens via explicit navigation (app.note.$id beforeLoad) or refresh().
      sessions.forEach((session) => {
        if (!sessionsStore[session.id]) {
          insertSession(session);
        }
      });

      const sessionWithEvents = await Promise.all(sessions.map(async (session) => {
        const event = await queryClient.fetchQuery({
          queryKey: ["event", session.id],
          queryFn: () => dbCommands.sessionGetEvent(session.id),
          staleTime: 5 * 60 * 1000,
        });
        return { ...session, event };
      }));

      return { sessions: groupSessions(sessionWithEvents) };
    },
    initialPageParam: { monthOffset: 0 },
    getNextPageParam: (_lastPage, _, { monthOffset }) => {
      return monthOffset > 12 * 10 ? undefined : { monthOffset: monthOffset + 1 };
    },
  });

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && sessions.hasNextPage) {
        sessions.fetchNextPage();
      }
    }, {
      threshold: 0.1,
      rootMargin: "50px",
    });

    if (lastItemRef.current) {
      observer.observe(lastItemRef.current);
    }

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [
    sessions.hasNextPage,
    sessions.fetchNextPage,
    sessions.data,
  ]);

  const setLastItemRef = useCallback((node: HTMLElement | null) => {
    lastItemRef.current = node;

    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });

  // Merge groups across all infinite query pages to avoid duplicate section headers.
  // The DB fetches by month, but groupSessions categorizes by event date — a session
  // created in Feb with an event in March can appear in both pages as recent.
  const mergedSections = useMemo(() => {
    if (!sessions.data?.pages) {
      return [];
    }

    const sectionMap = new Map<string, Session[]>();
    const sectionOrder: string[] = [];

    for (const page of sessions.data.pages) {
      for (const [key, items] of page.sessions) {
        if (!sectionMap.has(key)) {
          sectionMap.set(key, []);
          sectionOrder.push(key);
        }
        sectionMap.get(key)!.push(...items);
      }
    }

    // Dedup sessions by ID within each group (same session can appear in multiple pages)
    return sectionOrder.map(key => {
      const items = sectionMap.get(key)!;
      const seen = new Set<string>();
      const deduped = items.filter(s => {
        if (seen.has(s.id)) {
          return false;
        }
        seen.add(s.id);
        return true;
      });
      return [key, deduped] as [string, Session[]];
    });
  }, [sessions.data?.pages]);

  // Collect all visible note IDs for keyboard shortcuts
  const allVisibleNoteIds: string[] = [];
  mergedSections.forEach(([, items]) => {
    const filteredItems = items
      .filter((session) => sessionsStore[session.id])
      .filter((session) => !(session.id !== activeSessionId && session.id === ongoingSessionId))
      .filter(filter);

    filteredItems.forEach(session => {
      allVisibleNoteIds.push(session.id);
    });
  });

  // Enable keyboard shortcuts for multi-select
  useMultiSelectKeyboard({
    allVisibleNoteIds,
  });

  if (noteMatch && activeSessionId && !allVisibleNoteIds.includes(activeSessionId)) {
    debugLog("[NotesList] active session not visible in notes list", {
      activeSessionId,
      visibleCount: allVisibleNoteIds.length,
    });
  }

  const showEmptyState = !sessions.isLoading && allVisibleNoteIds.length === 0;
  const emptyStateCopy = i18n._("No notes yet.");

  return (
    <>
      {mergedSections.map(([key, items], sectionIndex) => {
        const filteredItems = items
          .filter((session) => sessionsStore[session.id])
          .filter((session) => !(session.id !== activeSessionId && session.id === ongoingSessionId))
          .filter(filter);

        if (filteredItems.length === 0) {
          return null;
        }

        const isOpen = !collapsedGroups.has(key);

        return (
          <section
            key={key}
            className="mt-2"
          >
            <Collapsible.Root open={isOpen} onOpenChange={() => toggleGroup(key)}>
              <Collapsible.Trigger className="group mb-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-sidebar-accent">
                <h2 className="text-[13px] font-medium text-muted-foreground/85">
                  {key}
                </h2>
                <ChevronDownIcon
                  size={13}
                  className={cn(
                    "text-muted-foreground/80 transition-transform duration-200",
                    !isOpen && "-rotate-90",
                  )}
                />
              </Collapsible.Trigger>
              <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
                <motion.div layout className="mb-2">
                  {filteredItems.map((session: Session) => (
                    <motion.div
                      key={session.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <NoteItem
                        activeSessionId={activeSessionId || ""}
                        currentSessionId={session.id}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </Collapsible.Content>
            </Collapsible.Root>
          </section>
        );
      })}

      {showEmptyState && (
        <section className="mt-2">
          <div className="px-1 py-1">
            <p className="text-xs text-muted-foreground">{emptyStateCopy}</p>
          </div>
        </section>
      )}

      <div
        ref={sessions.hasNextPage ? setLastItemRef : undefined}
        aria-hidden="true"
        className="h-2 w-full"
      />
    </>
  );
}

function NoteItem({
  activeSessionId,
  currentSessionId,
}: {
  activeSessionId: string;
  currentSessionId: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { thankYouSessionId } = useTypr();

  const currentSession = useSession(currentSessionId, (s) => ({
    title: s.session.title,
    created_at: s.session.created_at,
    record_start: s.session.record_start,
    needs_enhance: s.session.needs_enhance,
  }));

  const isActive = activeSessionId === currentSessionId;
  const [cardHovered, setCardHovered] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  // Multi-select state
  const { toggleNote, isSelected, isMultiSelectMode } = useMultiSelectNotes();
  const isNoteSelected = isSelected(currentSessionId);

  const isEnhancePending = useEnhancePendingState(currentSessionId);
  const shouldShowEnhancePending = !isActive && isEnhancePending;

  const currentSessionEvent = useQuery({
    queryKey: ["event", currentSessionId],
    queryFn: () => dbCommands.sessionGetEvent(currentSessionId),
  });

  const sessionDate = currentSessionEvent.data?.start_date ?? currentSession.record_start ?? currentSession.created_at;
  const formattedSessionDate = formatSidebarSessionDate(sessionDate);

  const queryClient = useQueryClient();

  const deleteSession = useMutation({
    mutationFn: () => deleteSessionWithWelcomeDismissal(currentSessionId, thankYouSessionId),
    onSuccess: () => {
      debugLog("[NotesList] DB delete success", { sessionId: currentSessionId, isActive });
      removeSessionsFromCache(queryClient, [currentSessionId]);
      if (isActive) {
        navigate({ to: "/app" });
      }
      miscCommands.deleteSessionFolder(currentSessionId).catch((error) => {
        console.warn("Failed to delete session folder:", error);
      });
    },
    onError: (error) => {
      console.error("Failed to delete session:", error);
      debugLog("[NotesList] DB delete failed", { sessionId: currentSessionId, error });
    },
  });

  const handleClick = () => {
    if (isMultiSelectMode) {
      toggleNote(currentSessionId);
    } else {
      navigate({
        to: "/app/note/$id",
        params: { id: currentSessionId },
      });
    }
  };

  const handleClickDelete = () => {
    confirm(t`Are you sure you want to delete this note?`).then((yes) => {
      if (yes) {
        debugLog("[NotesList] deleting", { sessionId: currentSessionId, isActive });
        deleteSession.mutate();
      }
    });
  };

  return (
    <div
      className={cn(
        "group flex h-8 w-full items-center rounded-md pl-2 pr-1",
        "relative cursor-pointer transition-colors duration-200",
        isNoteSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-0 before:left-0 before:bottom-0 before:w-[3px] before:rounded-l-md before:bg-primary"
          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      onClick={handleClick}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden transition-[width,margin,opacity] duration-200 ease-out",
          isMultiSelectMode ? "mr-1.5 w-4 opacity-100" : "mr-0 w-0 opacity-0",
        )}
        aria-hidden={!isMultiSelectMode}
      >
        {isMultiSelectMode && (
          <Checkbox
            checked={isNoteSelected}
            className={cn(
              "size-4 rounded-[4px]",
              !isNoteSelected && "border-muted-foreground/30 shadow-none",
            )}
            onCheckedChange={() => toggleNote(currentSessionId)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        <MarqueeTitle
          text={currentSession.title || t`New note`}
          className="min-w-0 flex-1 text-[13px] font-normal text-sidebar-foreground"
          hovered={cardHovered}
        />
      </div>

      {shouldShowEnhancePending && <Loader variant="dots" size="sm" />}
      {!isActive && currentSession.needs_enhance && !shouldShowEnhancePending && (
        <span className="mr-1.5 flex h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
      )}

      <DropdownMenu open={actionMenuOpen} onOpenChange={setActionMenuOpen}>
        <div
          className={cn(
            "relative ml-2 h-7 w-16 shrink-0 transition-[width] duration-200 ease-out group-hover:w-7 group-focus-within:w-7",
            actionMenuOpen && "w-7",
          )}
        >
          <span
            className={cn(
              "absolute inset-y-0 right-1 flex items-center whitespace-nowrap text-right text-[11px] text-muted-foreground transition-opacity duration-150",
              cardHovered || actionMenuOpen ? "opacity-0" : "opacity-100",
            )}
          >
            {formattedSessionDate}
          </span>

          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t`Note actions`}
              className={cn(
                "absolute right-0 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md",
                "text-muted-foreground transition-all duration-150",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                actionMenuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <i className="ri-more-2-fill text-base" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent
          align="end"
          sideOffset={4}
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={() => toggleNote(currentSessionId)}
          >
            <i className={cn("text-base", isNoteSelected ? "ri-checkbox-line" : "ri-checkbox-blank-line")} />
            {isNoteSelected ? <Trans>Deselect note</Trans> : <Trans>Select note</Trans>}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
            onSelect={handleClickDelete}
          >
            <TrashIcon size={16} />
            <Trans>Delete</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatSidebarSessionDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();

  if (FNS.isToday(d)) {
    return formatTimeLocale(d);
  }

  if (d > now) {
    return formatDate(d);
  }

  const minutes = FNS.differenceInMinutes(now, d);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = FNS.differenceInHours(now, d);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = FNS.differenceInCalendarDays(now, d);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = FNS.differenceInWeeks(now, d);
  if (weeks < 4) {
    return `${weeks}w`;
  }

  const months = FNS.differenceInMonths(now, d);
  if (months < 12) {
    return `${months}mo`;
  }

  return `${FNS.differenceInYears(now, d)}y`;
}

const groupSessions = (sessions: SessionWithEvent[]): [string, SessionWithEvent[]][] => {
  // Group sessions by category first
  const groupedSessions: Record<string, SessionWithEvent[]> = {};
  const now = new Date();

  // Get translated labels - call i18n._ inside the function to avoid race conditions
  const translations = {
    today: i18n._("Today"),
    last7Days: i18n._("Last 7 days"),
    thisMonth: i18n._("This month"),
    comingUp: i18n._("Coming up"),
  };

  // Helper function to get session date
  const getSessionDate = (session: SessionWithEvent): Date => {
    const dateStr = session.event?.start_date || session.record_start || session.created_at;
    return new Date(dateStr);
  };

  const isInLast7Days = (date: Date): boolean => {
    const daysAgo = FNS.differenceInCalendarDays(now, date);
    return daysAgo > 0 && daysAgo < 7;
  };

  // First pass: categorize each session
  for (const session of sessions) {
    const date = getSessionDate(session);
    let category: string;

    debugLog("Categorizing session:", session.id);
    debugLog("  Date:", date.toISOString());
    debugLog("  Today?", FNS.isToday(date));
    debugLog("  Last 7 days?", isInLast7Days(date));

    // Use consistent categorization approach
    if (date > now) {
      category = translations.comingUp;
    } else if (FNS.isToday(date)) {
      category = translations.today;
    } else if (isInLast7Days(date)) {
      category = translations.last7Days;
    } else if (FNS.isThisMonth(date)) {
      category = translations.thisMonth;
    } else {
      // Format past months consistently with locale support
      const locale = i18n.locale === "es" ? es : undefined;
      category = FNS.format(date, "MMMM yyyy", { locale });
    }

    // Initialize array if first item in category
    if (!groupedSessions[category]) {
      groupedSessions[category] = [];
    }

    groupedSessions[category].push(session);
  }

  // Convert to result format and sort by priority
  const categoryOrder = [translations.comingUp, translations.today, translations.last7Days, translations.thisMonth];
  const result: [string, SessionWithEvent[]][] = [];

  // Add standard categories first (if they exist)
  for (const category of categoryOrder) {
    if (groupedSessions[category]?.length > 0) {
      // Sort by date within each category (most recent first)
      const sorted = [...groupedSessions[category]].sort((a, b) => {
        const dateA = getSessionDate(a);
        const dateB = getSessionDate(b);
        return dateB.getTime() - dateA.getTime();
      });
      result.push([category, sorted]);
      delete groupedSessions[category]; // Remove after adding
    }
  }

  // Add remaining month categories sorted by date (most recent first)
  const remainingCategories = Object.keys(groupedSessions).sort((a, b) => {
    // Try to parse as month year format
    try {
      const dateA = FNS.parse(a, "MMMM yyyy", new Date());
      const dateB = FNS.parse(b, "MMMM yyyy", new Date());
      // Most recent first
      return dateB.getTime() - dateA.getTime();
    } catch (e) {
      // Fallback to string comparison
      return a.localeCompare(b);
    }
  });

  for (const category of remainingCategories) {
    result.push([category, groupedSessions[category]]);
  }

  return result;
};
