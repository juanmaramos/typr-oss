import { Trans, useLingui } from "@lingui/react/macro";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type LinkProps, useNavigate } from "@tanstack/react-router";

import { format } from "date-fns";
import { ArrowUpRight, CalendarDaysIcon, ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const INITIAL_DISPLAY_LIMIT = 5;

import { Loader } from "@/components/ui/loader";
import { useEnhancePendingState } from "@/hooks/enhance-pending";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { commands as appleCalendarCommands } from "@typr/plugin-apple-calendar";
import { type Event, type Session } from "@typr/plugin-db";
import { commands as windowsCommands } from "@typr/plugin-windows";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@typr/ui/components/ui/context-menu";
import { cn } from "@typr/ui/lib/utils";
import { useSession } from "@typr/utils/contexts";
import { formatUpcomingTime } from "@typr/utils/datetime";

type EventWithSession = Event & { session: Session | null };

interface EventsListProps {
  events?: EventWithSession[] | null;
  activeSessionId?: string;
  hasSelectedCalendars?: boolean;
  showEvents?: boolean;
  onToggleEvents?: (show: boolean) => void;
}

export default function EventsList({
  events,
  activeSessionId,
  hasSelectedCalendars = true,
  showEvents = true,
  onToggleEvents,
}: EventsListProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const upcomingEvents = events ?? [];

  const syncEventsMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      const result = await appleCalendarCommands.syncEvents();
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime < 500) {
        await new Promise(resolve => setTimeout(resolve, 500 - elapsedTime));
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate(query) {
          return query.queryKey?.[0] === "events";
        },
      });
    },
  });

  if (upcomingEvents.length === 0) {
    if (hasSelectedCalendars) {
      return null;
    }

    return (
      <section className="mb-3 mt-1">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => openSettingsWindow("/app/settings?tab=calendar")}
        >
          <CalendarDaysIcon size={12} />
          <Trans>Select calendars</Trans>
        </button>
      </section>
    );
  }

  return (
    <section className="mb-3 mt-1 pb-3">
      <Collapsible.Root open={showEvents} onOpenChange={onToggleEvents}>
        <div className="mb-2 flex items-center justify-between">
          <Collapsible.Trigger
            className="group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-sidebar-accent"
            aria-label={showEvents ? t`Collapse Coming up` : t`Expand Coming up`}
          >
            <h2 className="text-xs font-medium text-muted-foreground capitalize">
              <Trans>Coming up</Trans>
            </h2>
            <ChevronDownIcon
              size={13}
              className={cn(
                "text-muted-foreground/80 transition-transform duration-200",
                !showEvents && "-rotate-90",
              )}
            />
          </Collapsible.Trigger>

          <div className="flex items-center gap-1">
            <button
              disabled={syncEventsMutation.isPending}
              onClick={() => syncEventsMutation.mutate()}
              className="rounded p-1 transition-colors hover:bg-sidebar-accent"
              title={t`Refresh events`}
            >
              <RefreshCwIcon
                size={11}
                className={cn(
                  syncEventsMutation.isPending && "animate-spin",
                  "text-muted-foreground hover:text-foreground/80",
                )}
              />
            </button>
          </div>
        </div>
        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          {(() => {
            const displayLimit = showAll ? upcomingEvents.length : INITIAL_DISPLAY_LIMIT;
            const visibleEvents = upcomingEvents.slice(0, displayLimit);
            const hasMore = upcomingEvents.length > INITIAL_DISPLAY_LIMIT;

            return (
              <div>
                <AnimatePresence initial={false}>
                  {visibleEvents.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{
                        opacity: 1,
                        height: "auto",
                        transition: {
                          height: { duration: 0.3, ease: "easeInOut" },
                          opacity: { duration: 0.2, delay: 0.1 },
                        },
                      }}
                      exit={{
                        opacity: 0,
                        height: 0,
                        transition: {
                          opacity: { duration: 0.2 },
                          height: { duration: 0.3, delay: 0.1, ease: "easeInOut" },
                        },
                      }}
                      style={{ overflow: "hidden" }}
                      className="pl-2"
                    >
                      {visibleEvents
                        .sort((a, b) => a.start_date.localeCompare(b.start_date))
                        .map((event, index) => (
                          <motion.div
                            key={`event-${event.id}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              transition: {
                                delay: index * 0.05,
                                duration: 0.2,
                              },
                            }}
                            exit={{
                              opacity: 0,
                              y: -10,
                              transition: { duration: 0.15 },
                            }}
                          >
                            <EventItem
                              event={event}
                              activeSessionId={activeSessionId}
                            />
                          </motion.div>
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* See more / See less button */}
                {hasMore && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setShowAll(!showAll)}
                    className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    {showAll
                      ? <Trans>See less</Trans>
                      : <Trans>See {upcomingEvents.length - INITIAL_DISPLAY_LIMIT} more</Trans>}
                  </motion.button>
                )}
              </div>
            );
          })()}
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  );
}

function EventItem({
  event,
  activeSessionId,
}: {
  event: EventWithSession;
  activeSessionId?: string;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (event.session) {
      navigate({
        to: "/app/note/$id",
        params: { id: event.session.id },
      });
    } else {
      navigate({ to: "/app/new", search: { calendarEventId: event.id } });
    }
  };

  const handleOpenCalendar = () => {
    const date = new Date(event.start_date);
    const formattedDate = format(date, "yyyy-MM-dd");
    const url = { to: "/app/finder", search: { view: "calendar", date: formattedDate } } as const satisfies LinkProps;

    windowsCommands.windowShow({ type: "finder" }).then(() => {
      windowsCommands.windowEmitNavigate({ type: "finder" }, {
        path: url.to,
        search: url.search,
      });
    });
  };

  const isActive = activeSessionId
    && event.session?.id
    && activeSessionId === event.session.id;

  const sessionId = event.session?.id || "";
  const isEnhancePending = useEnhancePendingState(sessionId);
  const shouldShowEnhancePending = !isActive && !!event.session?.id && isEnhancePending;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <button
          onClick={handleClick}
          className={cn(
            "group mb-1 flex h-[40px] w-full items-center rounded-md px-3 text-left transition-colors duration-200",
            "relative",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:top-0 before:left-0 before:bottom-0 before:w-[3px] before:rounded-l-md before:bg-primary"
              : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <div className="flex-1 flex flex-col justify-center truncate">
            <EventItemTitle event={event} />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground line-clamp-1">
              <span>{formatUpcomingTime(new Date(event.start_date))}</span>
            </div>
          </div>

          {shouldShowEnhancePending && <Loader variant="dots" size="sm" />}
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          className="cursor-pointer flex items-center justify-between"
          onClick={handleOpenCalendar}
        >
          <div className="flex items-center gap-2">
            <CalendarDaysIcon size={16} />
            <Trans>View in calendar</Trans>
          </div>
          <ArrowUpRight size={16} className="ml-1 text-muted-foreground" />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function EventItemTitle({ event }: { event: EventWithSession }) {
  const sessionId = event.session?.id;

  return sessionId
    ? <EventItemTitleWithSession sessionId={sessionId} />
    : <EventItemTitleWithoutSession event={event} />;
}

function EventItemTitleWithoutSession({ event }: { event: EventWithSession }) {
  return (
    <div className="font-medium text-[13px] text-sidebar-foreground line-clamp-1">
      {event.name}
    </div>
  );
}

function EventItemTitleWithSession({ sessionId }: { sessionId: string }) {
  const title = useSession(sessionId, (s) => s.session.title);
  return (
    <div className="font-medium text-[13px] text-sidebar-foreground line-clamp-1">
      {title}
    </div>
  );
}
