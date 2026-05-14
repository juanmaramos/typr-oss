import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { subDays } from "date-fns";
import { SearchIcon, VideoIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useTypr } from "@/contexts";
import { commands as appleCalendarCommands } from "@typr/plugin-apple-calendar";
import { commands as dbCommands, type Event } from "@typr/plugin-db";
import { commands as miscCommands } from "@typr/plugin-misc";
import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";
import { useSession } from "@typr/utils/contexts";
import { formatSimpleDateWithTime, formatSimpleDateWithTimeRange } from "@typr/utils/datetime";
import { noteHeaderChipClassName } from "../styles";

interface EventChipProps {
  sessionId: string;
}

interface EventWithMeetingLink extends Event {
  meetingLink?: string | null;
}

export function EventChip({ sessionId }: EventChipProps) {
  const { t } = useLingui();
  const { userId, onboardingSessionId } = useTypr();
  const [isEventSelectorOpen, setIsEventSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const {
    sessionCreatedAt,
    updateTitle,
    session: currentSessionDetails,
  } = useSession(sessionId, (s) => ({
    sessionCreatedAt: s.session.created_at,
    updateTitle: s.updateTitle,
    session: s.session,
  }));

  const event = useQuery({
    queryKey: ["event", sessionId],
    queryFn: async (): Promise<EventWithMeetingLink | null> => {
      const eventData = await dbCommands.sessionGetEvent(sessionId);
      if (!eventData) {
        return null;
      }

      const meetingLink = await miscCommands.parseMeetingLink(eventData.note);
      return { ...eventData, meetingLink };
    },
  });

  const calendar = useQuery({
    enabled: !!event.data?.calendar_id,
    queryKey: ["calendar", event.data?.calendar_id],
    queryFn: async () => {
      const id = event.data?.calendar_id!;
      return dbCommands.getCalendar(id);
    },
  });

  const eventsInPastWithoutAssignedSession = useQuery({
    queryKey: ["events-in-past-without-assigned-session", userId, sessionId],
    queryFn: async (): Promise<Event[]> => {
      const events = await dbCommands.listEvents({
        limit: 100,
        user_id: userId,
        type: "dateRange",
        start: subDays(new Date(), 28).toISOString(),
        end: new Date().toISOString(),
      });

      const sessions = await Promise.all(
        events.map((eventItem) => dbCommands.getSession({ calendarEventId: eventItem.id })),
      );

      const ret = events.filter((eventItem) => {
        const isLinkedToAnotherSession = sessions.find((s) =>
          s?.calendar_event_id === eventItem.id && s.id !== sessionId
        );
        return !isLinkedToAnotherSession;
      });
      return ret;
    },
    enabled: isEventSelectorOpen && !event.data,
  });

  const assignEvent = useMutation({
    mutationFn: async (eventId: string) => {
      await dbCommands.setSessionEvent(sessionId, eventId);
      return eventId;
    },
    onSuccess: async (assignedEventId) => {
      // Optimistically update the event query cache to prevent race conditions
      const eventDetails = await dbCommands.getEvent(assignedEventId);
      if (eventDetails) {
        queryClient.setQueryData(["event", sessionId], { ...eventDetails, meetingLink: null });
      }

      // Wait for critical queries to complete before invalidating sessions
      await Promise.all([
        event.refetch(),
        eventsInPastWithoutAssignedSession.refetch(),
      ]);

      // Only invalidate sessions cache after individual queries are settled
      queryClient.invalidateQueries({ queryKey: ["sessions"] });

      if (assignedEventId && updateTitle && currentSessionDetails && eventDetails?.name) {
        try {
          if (!currentSessionDetails.title?.trim()) {
            updateTitle(eventDetails.name);
            queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
          }
        } catch (error) {
          console.error("Failed to update session title after event assignment:", error);
        }
      }
    },
  });

  const detachEvent = useMutation({
    mutationFn: async () => {
      await dbCommands.setSessionEvent(sessionId, null);
    },
    onSuccess: async () => {
      // Optimistically clear the event query cache
      queryClient.setQueryData(["event", sessionId], null);

      // Wait for critical queries to complete before invalidating sessions
      await Promise.all([
        event.refetch(),
        eventsInPastWithoutAssignedSession.refetch(),
      ]);

      // Only invalidate sessions cache after individual queries are settled
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setIsEventSelectorOpen(false);
    },
    onError: (error) => {
      console.error("Failed to detach session event:", error);
    },
  });

  const handleClickCalendar = () => {
    if (calendar.data) {
      if (calendar.data.platform === "Apple") {
        appleCalendarCommands.openCalendar();
      }
    }
  };

  const handleSelectEvent = async (eventIdToLink: string) => {
    assignEvent.mutate(eventIdToLink, {
      onSuccess: () => {
        setIsEventSelectorOpen(false);
      },
      onError: (error) => {
        console.error("Failed to set session event:", error);
      },
    });
  };

  const date = event.data?.start_date ?? sessionCreatedAt;

  if (onboardingSessionId === sessionId) {
    return (
      <div className={cn(noteHeaderChipClassName, "hover:bg-transparent")}>
        <Icon name="ri-calendar-line" className="h-4 w-4 text-muted-foreground" />
        <span>{formatSimpleDateWithTime(date)}</span>
      </div>
    );
  }

  if (event.data) {
    return (
      <Popover>
        <PopoverTrigger>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(noteHeaderChipClassName, "cursor-pointer")}>
                  <Icon name="ri-calendar-check-line" className="h-4 w-4 text-muted-foreground" />
                  <span>{formatSimpleDateWithTime(date)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {formatSimpleDateWithTime(date)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 relative">
          {(() => {
            const dateString = formatSimpleDateWithTimeRange(
              event.data.start_date,
              event.data.end_date,
            );

            return (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => detachEvent.mutate()}
                  className="absolute top-4 right-4 p-1 bg-destructive/10 text-destructive rounded-full hover:bg-destructive/20 transition-colors z-10"
                  aria-label={t`Detach event`}
                >
                  <XIcon size={12} />
                </button>
                <div className="font-semibold">{event.data.name}</div>
                <div className="text-sm text-muted-foreground">{dateString}</div>

                <div className="flex gap-2">
                  {event.data.meetingLink && (
                    <Button
                      onClick={() => {
                        const meetingLink = event.data?.meetingLink;
                        if (typeof meetingLink === "string") {
                          openUrl(meetingLink);
                        }
                      }}
                      className="flex-1"
                    >
                      <VideoIcon size={16} />
                      <Trans>Join meeting</Trans>
                    </Button>
                  )}

                  <Button variant="outline" onClick={handleClickCalendar} disabled={!calendar.data} className="flex-1">
                    <Trans>View in calendar</Trans>
                  </Button>
                </div>

                {event.data.note && (
                  <div className="border-t pt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto scrollbar-none">
                    {event.data.note}
                  </div>
                )}
              </div>
            );
          })()}
        </PopoverContent>
      </Popover>
    );
  } else {
    return (
      <Popover open={isEventSelectorOpen} onOpenChange={setIsEventSelectorOpen}>
        <PopoverTrigger asChild>
          <div className={cn(noteHeaderChipClassName, "cursor-pointer")}>
            <Icon name="ri-calendar-line" className="h-4 w-4 text-muted-foreground" />
            <span>{formatSimpleDateWithTime(sessionCreatedAt)}</span>
          </div>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80">
          <div className="flex items-center w-full px-2 py-1.5 gap-2 rounded-md bg-muted/50 border border-input transition-colors mb-2">
            <span className="text-muted-foreground flex-shrink-0">
              <SearchIcon className="size-4" />
            </span>
            <input
              type="text"
              placeholder={t`Search and link to past events...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/70"
            />
          </div>

          {(() => {
            if (eventsInPastWithoutAssignedSession.isLoading) {
              return (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <Trans>Loading events...</Trans>
                </div>
              );
            }

            const filteredEvents = (eventsInPastWithoutAssignedSession.data || [])
              .filter((ev: Event) => ev.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => {
                const dateA = new Date(a.start_date);
                const dateB = new Date(b.start_date);
                if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) {
                  return 0;
                }
                if (isNaN(dateA.getTime())) {
                  return 1;
                }
                if (isNaN(dateB.getTime())) {
                  return -1;
                }
                return dateB.getTime() - dateA.getTime();
              });

            if (filteredEvents.length === 0) {
              return (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <Trans>No past events found</Trans>
                </div>
              );
            }

            return (
              <div className="max-h-60 overflow-y-auto pt-0">
                {filteredEvents.map((linkableEv: Event) => (
                  <button
                    key={linkableEv.id}
                    onClick={() => handleSelectEvent(linkableEv.id)}
                    className="flex flex-col items-start p-2 hover:bg-surface-400 text-left w-full rounded-md"
                  >
                    <p className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full">
                      {linkableEv.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatSimpleDateWithTime(linkableEv.start_date)}
                    </p>
                  </button>
                ))}
              </div>
            );
          })()}
        </PopoverContent>
      </Popover>
    );
  }
}
