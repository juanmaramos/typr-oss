import { useQuery } from "@tanstack/react-query";
import { useLocation, useMatch, useNavigate } from "@tanstack/react-router";
import { addDays, subHours } from "date-fns";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { useMemo, useState } from "react";

import { debugLog } from "@/components/utils/debug-logger";
import { useTypr, useTyprSearch, useNewNote } from "@/contexts";
import { usePlatform } from "@/hooks/usePlatform";
import { useMultiSelectNotes } from "@/stores/useMultiSelectNotes";
import { commands as configCommands } from "@typr/plugin-config";
import { type Calendar, commands as dbCommands } from "@typr/plugin-db";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSessions } from "@typr/utils/contexts";
import { Trans } from "@lingui/react/macro";
import { BulkActionBar } from "./bulk-delete-button";
import EventsList from "./events-list";
import NotesList from "./notes-list";
import OngoingSession from "./ongoing-session";
import { ProjectsSection } from "./projects-section";
import SearchList from "./search-list";
import { TopArea } from "./top-area";

// Helper function to get session date (matches notes-list.tsx logic)
const getSessionDate = (session: any): string => {
  if (session.event?.start_date) {
    return session.event.start_date;
  }
  if (session.record_start) {
    return session.record_start;
  }
  return session.created_at;
};

export default function LeftSidebar() {
  const { userId } = useTypr();
  const { createNewNote } = useNewNote();
  const navigate = useNavigate();
  const location = useLocation();
  const [showEvents, setShowEvents] = useState(true);
  const { isMultiSelectMode, getSelectedCount } = useMultiSelectNotes();

  const insertSession = useSessions((s) => s.insert);
  const { status, ongoingSessionId } = useOngoingSession((s) => ({
    status: s.status,
    ongoingSessionId: s.sessionId,
  }));

  const { isSearching, matches } = useTyprSearch((s) => ({
    isSearching: !!s.query,
    matches: s.matches,
  }));

  const windowLabel = getCurrentWebviewWindowLabel();
  const { isWindows, isLoading: isPlatformLoading } = usePlatform();
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const activeSessionId = noteMatch?.params.id;
  const isInOngoingNoteMain = activeSessionId === ongoingSessionId;
  const isInOngoingNoteSub = activeSessionId === ongoingSessionId;
  const isInOngoingNote = isInOngoingNoteMain || isInOngoingNoteSub;
  const isMeetingRunning = status === "running_active" || status === "running_paused";
  const inMeetingAndNotInNote = isMeetingRunning
    && ongoingSessionId !== null
    && !isInOngoingNote;

  const generalConfig = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
    staleTime: 30 * 1000,
  });

  const supportsUpcomingEvents = !isPlatformLoading && !isWindows;
  const showUpcomingInSidebar = supportsUpcomingEvents && (generalConfig.data?.show_upcoming_in_sidebar ?? false);

  const calendarsQuery = useQuery({
    queryKey: ["calendars", userId],
    queryFn: () => dbCommands.listCalendars(userId),
    enabled: showUpcomingInSidebar,
    staleTime: 15000,
  });
  const hasSelectedCalendars = useMemo(
    () => {
      if (!calendarsQuery.data) {
        return true;
      }
      return calendarsQuery.data.some((calendar: Calendar) => calendar.selected);
    },
    [calendarsQuery.data],
  );

  const events = useQuery({
    queryKey: ["events", ongoingSessionId, showUpcomingInSidebar],
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      const upcomingRangeEnd = addDays(endOfToday, 30);

      // Include upcoming events so future-linked notes are visible in the sidebar.
      const rawEvents = await dbCommands.listEvents({
        type: "dateRange",
        user_id: userId,
        limit: 100,
        start: subHours(now, 12).toISOString(), // Include ongoing events
        end: upcomingRangeEnd.toISOString(),
      });

      const upcomingEvents = rawEvents.filter(
        (event) => new Date(event.end_date) > now,
      );

      if (upcomingEvents.length === 0) {
        return [];
      }

      const sessions = await Promise.all(
        upcomingEvents.map((event) => dbCommands.getSession({ calendarEventId: event.id })),
      );
      sessions
        .filter((s) => s !== null)
        .forEach((s) => insertSession(s!));

      debugLog("[Sidebar] upcoming events resolved", {
        eventCount: upcomingEvents.length,
        linkedSessionCount: sessions.filter(Boolean).length,
        linked: upcomingEvents.map((event, index) => ({
          eventId: event.id,
          eventName: event.name,
          sessionId: sessions[index]?.id ?? null,
          sessionTitle: sessions[index]?.title ?? null,
        })),
      });

      return upcomingEvents.map((event, index) => ({
        ...event,
        session: sessions[index],
      }));
    },
    enabled: showUpcomingInSidebar,
  });

  const upcomingLinkedSessionIds = useMemo(() => {
    const now = new Date();
    return new Set(
      (events.data ?? [])
        .filter((event) => new Date(event.start_date) > now)
        .map((event) => event.session?.id)
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    );
  }, [events.data]);

  const showBulkActionBar = isMultiSelectMode && getSelectedCount() > 0;
  const isAskActive = location.pathname.startsWith("/app/ask");

  if (windowLabel !== "main") {
    return null;
  }

  debugLog("[Sidebar] render context", {
    activeSessionId: activeSessionId ?? null,
    isSearching,
    showUpcomingInSidebar,
    upcomingEventCount: events.data?.length ?? 0,
    upcomingLinkedSessionCount: upcomingLinkedSessionIds.size,
  });

  return (
    <nav className="relative flex h-full w-full flex-col overflow-hidden bg-sidebar">
      <TopArea />

      {!isSearching && (
        <>
          <div className="px-3 pb-1 pt-2">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => createNewNote("sidebar")}
            >
              <i className="ri-edit-box-line shrink-0 text-sm text-muted-foreground" />
              <Trans>New note</Trans>
            </button>
            <button
              type="button"
              className={cn(
                "relative mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isAskActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:rounded-l-md before:bg-primary"
                  : "text-sidebar-foreground",
              )}
              onClick={() => navigate({ to: "/app/ask" })}
            >
              <i
                className={cn(
                  "ri-chat-ai-line shrink-0 text-sm",
                  isAskActive ? "text-sidebar-accent-foreground/80" : "text-muted-foreground",
                )}
              />
              <Trans>Ask</Trans>
            </button>
          </div>
          <ProjectsSection />
        </>
      )}

      {inMeetingAndNotInNote && <OngoingSession sessionId={ongoingSessionId} />}

      {isSearching
        ? (
          <div className="flex-1 h-full overflow-y-auto scrollbar-none rounded-bl-xl">
            <SearchList matches={matches} />
          </div>
        )
        : (
          <LayoutGroup>
            <AnimatePresence initial={false}>
              <div className="flex-1 h-full overflow-y-auto scrollbar-none rounded-bl-xl">
                <div className={showBulkActionBar ? "h-full space-y-0 px-3 pb-20" : "h-full space-y-0 px-3 pb-4"}>
                  <div className="flex items-center justify-between pb-1 pt-1">
                    <div className="text-[13px] font-semibold text-muted-foreground">
                      <Trans>Notes</Trans>
                    </div>
                  </div>
                  <div>
                    {showUpcomingInSidebar && (
                      <EventsList
                        events={events.data?.filter(
                          (event) => {
                            const eventDate = new Date(event.start_date);
                            const now = new Date();
                            const isFutureEvent = eventDate > now;
                            const isNotOngoingOrIsActive = !(
                              event.session?.id
                              && ongoingSessionId
                              && event.session.id === ongoingSessionId
                              && event.session.id !== activeSessionId
                            );

                            return isFutureEvent && isNotOngoingOrIsActive;
                          },
                        )}
                        activeSessionId={activeSessionId}
                        hasSelectedCalendars={hasSelectedCalendars}
                        showEvents={showEvents}
                        onToggleEvents={setShowEvents}
                      />
                    )}
                    <NotesList
                      filter={(session) => {
                        // Pure temporal logic: show only past + today sessions
                        const sessionDate = getSessionDate(session);
                        const now = new Date();
                        const isAlreadyShownInComingUp = upcomingLinkedSessionIds.has(session.id);
                        return new Date(sessionDate) <= now && !isAlreadyShownInComingUp;
                      }}
                      ongoingSessionId={ongoingSessionId}
                      activeSessionId={activeSessionId}
                    />
                  </div>
                </div>
              </div>
            </AnimatePresence>
          </LayoutGroup>
        )}

      <BulkActionBar />
    </nav>
  );
}
