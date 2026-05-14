import { useLingui } from "@lingui/react/macro";
import type { LinkProps } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { Archive, Calendar, ChevronDown, ChevronUp, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { commands as dbCommands } from "@typr/plugin-db";
import { commands as windowsCommands } from "@typr/plugin-windows";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@typr/ui/components/ui/tabs";

interface TableViewProps {
  date: Date;
  sessions: any[];
  events: any[];
  onNavigate: (params: { date: string }) => void;
}

type TableItemType = "session" | "event" | "all";

interface TableItem {
  id: string;
  title: string;
  date: Date;
  type: "session" | "event";
  original: any;
  tags?: string[];
  duration?: number;
}

type SortField = "title" | "date" | "type";
type SortOrder = "asc" | "desc";

export function TableView({ date, sessions, events, onNavigate }: TableViewProps) {
  const { t } = useLingui();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TableItemType>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const tableItems = useMemo(() => {
    const items: TableItem[] = [];

    sessions.forEach(session => {
      items.push({
        id: session.id,
        title: session.title || "New note",
        date: new Date(session.created_at),
        type: "session",
        original: session,
        tags: session.tags || [],
        duration: session.duration || 0,
      });
    });

    events.forEach(event => {
      const startDate = event.start_date ? new Date(event.start_date) : new Date();
      const endDate = event.end_date ? new Date(event.end_date) : startDate;
      const durationInMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

      items.push({
        id: event.id,
        title: event.name || "Untitled Event",
        date: startDate,
        type: "event",
        original: event,
        duration: durationInMinutes,
      });
    });

    return items;
  }, [sessions, events]);

  const filteredItems = useMemo(() => {
    return tableItems
      .filter(item => {
        if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }

        if (activeTab !== "all" && item.type !== activeTab) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;

        if (sortField === "title") {
          comparison = a.title.localeCompare(b.title);
        } else if (sortField === "date") {
          comparison = a.date.getTime() - b.date.getTime();
        } else if (sortField === "type") {
          comparison = a.type.localeCompare(b.type);
        }

        return sortOrder === "asc" ? comparison : -comparison;
      });
  }, [tableItems, searchTerm, activeTab, sortField, sortOrder]);

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleRowClick = async (item: TableItem) => {
    if (item.type === "session") {
      const url = { to: "/app/note/$id", params: { id: item.id } } as const satisfies LinkProps;
      windowsCommands.windowShow({ type: "main" }).then(() => {
        windowsCommands.windowEmitNavigate({ type: "main" }, {
          path: url.to.replace("$id", item.id),
          search: null,
        });
      });
    } else if (item.type === "event") {
      try {
        const session = await dbCommands.getSession({ calendarEventId: item.id });

        if (session) {
          const url = { to: "/app/note/$id", params: { id: session.id } } as const satisfies LinkProps;
          windowsCommands.windowShow({ type: "main" }).then(() => {
            windowsCommands.windowEmitNavigate({ type: "main" }, {
              path: url.to.replace("$id", session.id),
              search: null,
            });
          });
        } else {
          const url = { to: "/app/new", search: { calendarEventId: item.id } } as const satisfies LinkProps;
          windowsCommands.windowShow({ type: "main" }).then(() => {
            windowsCommands.windowEmitNavigate({ type: "main" }, {
              path: url.to,
              search: url.search,
            });
          });
        }
      } catch (error) {
        const url = { to: "/app/new", search: { calendarEventId: item.id } } as const satisfies LinkProps;
        windowsCommands.windowShow({ type: "main" }).then(() => {
          windowsCommands.windowEmitNavigate({ type: "main" }, {
            path: url.to,
            search: url.search,
          });
        });
      }
    }
  };

  const formatDuration = (minutes: number): string => {
    if (!minutes || minutes === 0) {
      return "N/A";
    }

    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
  };

  const formatDisplayDate = (dateObj: Date): string => {
    const timeStr = dateObj.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: undefined, // Respect user's locale preferences
    });

    if (isToday(dateObj)) {
      return `Today, ${timeStr}`;
    }
    return `${format(dateObj, "MMM d, yyyy")}, ${timeStr}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with search and filters */}
      <div className="p-4 pb-2 border-b border/50">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder={t`Search notes and events...`}
            className="pl-9 h-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs
          defaultValue="all"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TableItemType)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 mb-2">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="session">Notes</TabsTrigger>
            <TabsTrigger value="event">Events</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto">
        {filteredItems.length > 0
          ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-background shadow-sm z-10">
                <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border">
                  <th
                    className="px-4 py-2 text-left cursor-pointer"
                    onClick={() => handleSortClick("type")}
                  >
                    <div className="flex items-center">
                      Type
                      {sortField === "type" && (
                        sortOrder === "asc"
                          ? <ChevronUp className="h-3 w-3 ml-1" />
                          : <ChevronDown className="h-3 w-3 ml-1" />
                      )}
                      {sortField !== "type" && <ChevronDown className="h-3 w-3 ml-1 opacity-30" />}
                    </div>
                  </th>
                  <th
                    className="px-4 py-2 text-left cursor-pointer"
                    onClick={() => handleSortClick("title")}
                  >
                    <div className="flex items-center">
                      Title
                      {sortField === "title" && (
                        sortOrder === "asc"
                          ? <ChevronUp className="h-3 w-3 ml-1" />
                          : <ChevronDown className="h-3 w-3 ml-1" />
                      )}
                      {sortField !== "title" && <ChevronDown className="h-3 w-3 ml-1 opacity-30" />}
                    </div>
                  </th>
                  <th
                    className="px-4 py-2 text-left cursor-pointer"
                    onClick={() => handleSortClick("date")}
                  >
                    <div className="flex items-center">
                      Date
                      {sortField === "date" && (
                        sortOrder === "asc"
                          ? <ChevronUp className="h-3 w-3 ml-1" />
                          : <ChevronDown className="h-3 w-3 ml-1" />
                      )}
                      {sortField !== "date" && <ChevronDown className="h-3 w-3 ml-1 opacity-30" />}
                    </div>
                  </th>
                  <th className="px-4 py-2 text-left">Duration</th>
                  <th className="px-4 py-2 text-left">Tags</th>
                </tr>
              </thead>
              <tbody className="bg-background">
                {filteredItems.map((item) => (
                  <tr
                    key={`${item.type}-${item.id}`}
                    className="border-b border/50 hover:bg-surface-400/50 cursor-pointer"
                    onClick={() => handleRowClick(item)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-1.5 rounded-md mr-2 bg-muted">
                          {item.type === "session"
                            ? <FileText className="h-3.5 w-3.5 text-primary" />
                            : <Calendar className="h-3.5 w-3.5 text-info" />}
                        </div>
                        <span className="text-xs text-muted-foreground font-medium">
                          {item.type === "session" ? "Note" : "Event"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      <div className="text-sm font-medium truncate">{item.title}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-muted-foreground">
                        {formatDisplayDate(item.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDuration(item.duration || 0)}
                    </td>
                    <td className="px-4 py-3">
                      {item.tags && item.tags.length > 0
                        ? (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.slice(0, 2).map((tag: string, i: number) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 text-xs rounded-sm bg-muted text-foreground/80"
                              >
                                {tag}
                              </span>
                            ))}
                            {item.tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{item.tags.length - 2} more
                              </span>
                            )}
                          </div>
                        )
                        : <span className="text-xs text-muted-foreground/70">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
          : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/70 pt-12">
              <Archive className="h-12 w-12 mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">No items found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {searchTerm ? "Try a different search term" : "Create notes or events to see them here"}
              </p>

              {searchTerm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchTerm("")}
                  className="mt-4"
                >
                  Clear search
                </Button>
              )}
            </div>
          )}
      </div>
    </div>
  );
}
