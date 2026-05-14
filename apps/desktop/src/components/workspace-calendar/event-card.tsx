import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";
import { format } from "date-fns";
import { Calendar, FileText, Pen } from "lucide-react";
import { useMemo, useState } from "react";

import { useTypr } from "@/contexts";
import { openURL } from "@/utils/shell";
import type { Event } from "@typr/plugin-db";
import { commands as dbCommands } from "@typr/plugin-db";
import { commands as windowsCommands } from "@typr/plugin-windows";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";

export function EventCard({
  event,
  showTime = false,
}: {
  event: Event;
  showTime?: boolean;
}) {
  const { userId } = useTypr();
  const session = useQuery({
    queryKey: ["event-session", event.id],
    queryFn: async () => dbCommands.getSession({ calendarEventId: event.id }),
  });

  const participants = useQuery({
    queryKey: ["participants", session.data?.id],
    queryFn: async () => {
      if (!session.data?.id) {
        return [];
      }
      const participants = await dbCommands.sessionListParticipants(session.data.id);
      return participants.sort((a, b) => {
        if (a.is_user && !b.is_user) {
          return 1;
        }
        if (!a.is_user && b.is_user) {
          return -1;
        }
        return 0;
      });
    },
    enabled: !!session.data?.id,
  });

  const participantsPreview = useMemo(() => {
    const count = participants.data?.length ?? 0;
    if (count === 0) {
      return null;
    }

    return participants.data?.map(participant => {
      if (participant.id === userId && !participant.full_name) {
        return "You";
      }
      return participant.full_name ?? "??";
    });
  }, [participants.data, userId]);

  const [open, setOpen] = useState(false);

  const handleClick = () => {
    setOpen(false);

    if (session.data) {
      const id = session.data.id;
      const url = { to: "/app/note/$id", params: { id } } as const satisfies LinkProps;
      windowsCommands.windowShow({ type: "main" }).then(() => {
        windowsCommands.windowEmitNavigate({ type: "main" }, {
          path: url.to.replace("$id", id),
          search: null,
        });
      });
    } else {
      const url = { to: "/app/new", search: { calendarEventId: event.id } } as const satisfies LinkProps;
      windowsCommands.windowShow({ type: "main" }).then(() => {
        windowsCommands.windowEmitNavigate({ type: "main" }, {
          path: url.to,
          search: url.search,
        });
      });
    }
  };

  const getStartDate = () => {
    return new Date(event.start_date);
  };

  const getEndDate = () => {
    return new Date(event.end_date);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center space-x-1 px-0.5 py-0.5 cursor-pointer rounded hover:bg-surface-400 transition-colors h-5">
          <Calendar className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />

          <div className="flex-1 text-xs text-foreground truncate">
            {event.name || "Untitled Event"}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 bg-background m-2">
        <div
          className="font-semibold text-lg text-foreground flex items-center gap-2 mb-2 cursor-pointer hover:text-primary transition-all decoration-dotted underline hover:decoration-solid"
          onClick={() =>
            event.google_event_url && openURL(event.google_event_url as string).catch(error =>
              console.error("Failed to open event URL:", error)
            )}
        >
          {event.name || "Untitled Event"}
        </div>

        <p className="text-sm text-muted-foreground mb-2">
          {format(getStartDate(), "MMM d, h:mm a")}
          {" - "}
          {format(getStartDate(), "yyyy-MM-dd")
              !== format(getEndDate(), "yyyy-MM-dd")
            ? format(getEndDate(), "MMM d, h:mm a")
            : format(getEndDate(), "h:mm a")}
        </p>

        {participantsPreview && participantsPreview.length > 0 && (
          <div className="text-xs text-muted-foreground mb-4">
            {participantsPreview.join(", ")}
          </div>
        )}

        {session.data
          ? (
            <div
              className="flex items-center gap-2 px-2 py-1 bg-muted/50 border border rounded-md cursor-pointer hover:bg-surface-400 transition-colors"
              onClick={handleClick}
            >
              <FileText className="size-3 text-muted-foreground flex-shrink-0" />
              <div className="text-xs font-medium text-foreground truncate">
                {session.data.title || "New note"}
              </div>
            </div>
          )
          : (
            <div
              className="flex items-center gap-2 px-2 py-1 bg-muted/50 border border rounded-md cursor-pointer hover:bg-surface-400 transition-colors"
              onClick={handleClick}
            >
              <Pen className="size-3 text-muted-foreground flex-shrink-0" />
              <div className="text-xs font-medium text-foreground truncate">
                <Trans>Create Note</Trans>
              </div>
            </div>
          )}
      </PopoverContent>
    </Popover>
  );
}
