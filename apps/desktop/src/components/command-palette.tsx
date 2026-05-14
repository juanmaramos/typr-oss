import {
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@typr/ui/components/ui/command";

import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { CalendarIcon, FileTextIcon, MicIcon, PlusIcon, Search, UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ShortcutById } from "@/components/shortcut-by-id";
import { useAudioUpload } from "@/contexts/audio-upload";
import { useTypr } from "@/contexts/typr";
import { useYouTubeImport } from "@/contexts/youtube-import";
import { type SearchMatch } from "@/stores/search";
import { commands as dbCommands } from "@typr/plugin-db";
import { commands as windowsCommands } from "@typr/plugin-windows";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const highlightText = (text: string, query: string) => {
  if (!query.trim()) {
    return text;
  }

  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={index} className="font-bold text-foreground">{part}</span>
      : part
  );
};

const extractContentSnippet = (htmlContent: string, query: string) => {
  if (!htmlContent || !query.trim()) {
    return null;
  }

  const plainText = htmlContent
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lowerText = plainText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return null;
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(plainText.length, start + 120);

  let snippet = plainText.slice(start, end);

  if (start > 0) {
    snippet = "..." + snippet;
  }
  if (end < plainText.length) {
    snippet = snippet + "...";
  }

  return snippet;
};

// Removed sortSessionMatches - command palettes should use relevance, not manual sorting
// const sortSessionMatches = (matches: (SearchMatch & { type: "session" })[], sortBy: "latest" | "oldest") => {
//   return [...matches].sort((a, b) => {
//     const dateA = new Date(a.item.created_at).getTime();
//     const dateB = new Date(b.item.created_at).getTime();
//
//     if (sortBy === "latest") {
//       return dateB - dateA; // newest first
//     } else {
//       return dateA - dateB; // oldest first
//     }
//   });
// };

const extractParticipantSnippet = async (sessionId: string, query: string) => {
  try {
    const participants = await dbCommands.sessionListParticipants(sessionId);
    const matchingParticipants = participants.filter(p =>
      (p.full_name && p.full_name.toLowerCase().includes(query.toLowerCase()))
      || (p.email && p.email.toLowerCase().includes(query.toLowerCase()))
    );

    if (matchingParticipants.length > 0) {
      const names = matchingParticipants
        .map(p => p.full_name || p.email)
        .filter(Boolean)
        .slice(0, 3); // Limit to 3 names

      const nameText = names.join(", ");
      const extraCount = matchingParticipants.length - names.length;

      return extraCount > 0
        ? `Meeting with ${nameText} and ${extraCount} other${extraCount > 1 ? "s" : ""}`
        : `Meeting with ${nameText}`;
    }
  } catch (error) {
    console.error("Error fetching participants:", error);
  }
  return null;
};

// Create a separate component for session items
function SessionItem({ match, query, onSelect }: {
  match: SearchMatch & { type: "session" };
  query: string;
  onSelect: () => void;
}) {
  const [participantSnippet, setParticipantSnippet] = useState<string | null>(null);
  const titleMatches = (match.item.title || "").toLowerCase().includes(query.toLowerCase());

  // Try content snippets first
  const contentSnippet = !titleMatches
    ? (() => {
      if (match.item.enhanced_memo_html) {
        const enhancedSnippet = extractContentSnippet(match.item.enhanced_memo_html, query);
        if (enhancedSnippet) {
          return enhancedSnippet;
        }
      }

      if (match.item.raw_memo_html) {
        return extractContentSnippet(match.item.raw_memo_html, query);
      }

      return null;
    })()
    : null;

  // Fetch participant snippet only if no content snippet
  useEffect(() => {
    if (!titleMatches && !contentSnippet) {
      extractParticipantSnippet(match.item.id, query).then(setParticipantSnippet);
    } else {
      setParticipantSnippet(null);
    }
  }, [match.item.id, query, titleMatches, contentSnippet]);

  const snippet = contentSnippet
    ? { type: "content" as const, text: contentSnippet }
    : participantSnippet
    ? { type: "participants" as const, text: participantSnippet }
    : null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <CommandItem
      key={`session-${match.item.id}`}
      value={`session-${match.item.id}`}
      className="flex items-start gap-3 py-3"
      onSelect={onSelect}
    >
      <FileTextIcon className="h-4 w-4 text-muted-foreground mt-1" />
      <div className="flex flex-col items-start flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {highlightText(match.item.title || "New note", query)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground mt-1">
          {formatDate(match.item.created_at)}
        </span>
        {snippet && (
          <div
            className={`text-xs mt-2 flex items-center gap-1 ${
              snippet.type === "participants"
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {snippet.type === "participants" && <UserIcon className="h-3 w-3 flex-shrink-0" />}
            <span className={snippet.type === "participants" ? "" : ""}>
              {snippet.type === "participants"
                ? snippet.text
                : highlightText(snippet.text, query)}
            </span>
          </div>
        )}
      </div>
    </CommandItem>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { userId } = useTypr();
  const navigate = useNavigate();
  const { t } = useLingui();

  // Local state for command palette only
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Removed sort functionality - not needed for command palette UX
  // const [sortBy, setSortBy] = useState<"latest" | "oldest">("latest");
  // const [showConfig, setShowConfig] = useState(false);

  // Local search function (similar to the global one)
  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setMatches([]);
      return;
    }

    setIsSearching(true);

    try {
      const [sessions, events, allTags] = await Promise.all([
        dbCommands.listSessions({ type: "search", query: searchQuery, limit: 10, user_id: userId }),
        dbCommands.listEvents({ type: "search", query: searchQuery, limit: 5, user_id: userId }),
        dbCommands.listAllTags(),
      ]);

      // Find tags whose names match the query
      const matchingTagIds = allTags
        .filter(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .map(tag => tag.id);

      // If there are matching tags, also search sessions by tag
      let tagSessions: typeof sessions = [];
      if (matchingTagIds.length > 0) {
        tagSessions = await dbCommands.listSessions({
          type: "tagFilter",
          tag_ids: matchingTagIds,
          limit: 10,
          user_id: userId,
        });
      }

      // Merge and deduplicate sessions
      const sessionIds = new Set(sessions.map(s => s.id));
      const mergedSessions = [
        ...sessions,
        ...tagSessions.filter(s => !sessionIds.has(s.id)),
      ];

      const results: SearchMatch[] = [
        ...mergedSessions.map((session): SearchMatch => ({ type: "session", item: session })),
        ...events.map((event): SearchMatch => ({ type: "event", item: event })),
      ];

      setMatches(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Auto-focus when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setMatches([]);
    }
  }, [open]);

  // Helper function to handle navigation and close
  const handleNavigate = (to: string, search?: Record<string, any>) => {
    navigate({ to, search });
    onOpenChange(false);
  };

  // Cmd+N to create new note (only when command palette is open)
  useHotkeys(
    "mod+n",
    (event) => {
      if (open) {
        event.preventDefault();
        handleNavigate("/app/new");
      }
    },
    [open, handleNavigate],
  );

  // Cmd+Shift+R to start transcription (only when command palette is open)
  useHotkeys(
    "mod+shift+r",
    (event) => {
      if (open) {
        event.preventDefault();
        handleNavigate("/app/new", { record: true });
      }
    },
    [open, handleNavigate],
  );

  // Use the global YouTube import context
  const { openYouTubeImport } = useYouTubeImport();
  const { openAudioUpload } = useAudioUpload();

  // Handle YouTube import
  const handleImportYouTube = () => {
    onOpenChange(false);
    openYouTubeImport();
  };

  // Handle item selection
  const handleSelectItem = (match: SearchMatch) => {
    switch (match.type) {
      case "session":
        navigate({ to: "/app/note/$id", params: { id: match.item.id } });
        break;
      case "event":
        navigate({ to: "/app/new", search: { calendarEventId: match.item.id } });
        break;
      case "human":
        // Open finder window and navigate to contact view with person selected
        windowsCommands.windowShow({ type: "finder" }).then(() => {
          windowsCommands.windowNavigate(
            { type: "finder" },
            `/app/finder?view=contact&personId=${match.item.id}`,
          );
        });
        break;
      case "organization":
        // Open finder window and navigate to contact view with organization selected
        windowsCommands.windowShow({ type: "finder" }).then(() => {
          windowsCommands.windowNavigate(
            { type: "finder" },
            `/app/finder?view=contact&orgId=${match.item.id}`,
          );
        });
        break;
    }
    onOpenChange(false);
  };

  // Group results by type
  const sessionMatches = matches.filter(match => match.type === "session");
  const eventMatches = matches.filter(match => match.type === "event");
  // const humanMatches = matches.filter(match => match.type === "human");
  // const organizationMatches = matches.filter(match => match.type === "organization");

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  useEffect(() => {
    if (open) {
      // Override the hardcoded max-width - make it more compact
      const style = document.createElement("style");
      style.textContent = `
        [role="dialog"][aria-modal="true"] {
          width: 480px !important;
          max-width: 70vw !important;
        }
      `;
      document.head.appendChild(style);

      return () => {
        document.head.removeChild(style);
      };
    }
  }, [open]);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        shouldFilter={false}
      >
        {/* Custom Input with Filter Icon */}
        <div className="flex items-center px-3 border-b" cmdk-input-wrapper="">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <CommandPrimitive.Input
            ref={inputRef}
            className="flex h-11 w-full rounded-lg bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={t`Search notes, events, people...`}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
        </div>

        <CommandList className="max-h-96 pb-3">
          {/* Show actions first when empty, search results first when searching */}
          {!query && (
            <CommandGroup heading={t`Actions`}>
              <CommandItem
                value="create-new-note"
                onSelect={() => handleNavigate("/app/new")}
                className="flex items-center gap-3"
              >
                <PlusIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  <Trans>Create new note</Trans>
                </span>
                <ShortcutById shortcutId="new-note" />
              </CommandItem>

              <CommandItem
                value="start-transcription"
                onSelect={() => handleNavigate("/app/new", { record: true })}
                className="flex items-center gap-3"
              >
                <MicIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  <Trans>Start new transcription</Trans>
                </span>
                <ShortcutById shortcutId="start-transcript" />
              </CommandItem>

              <CommandItem
                value="upload-audio-file"
                onSelect={() => {
                  onOpenChange(false);
                  openAudioUpload();
                }}
                className="flex items-center gap-3"
              >
                <i className="ri-upload-2-line h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  <Trans>Upload audio for transcription</Trans>
                </span>
                <ShortcutById shortcutId="upload-audio" />
              </CommandItem>

              <CommandItem
                value="import-youtube-video"
                onSelect={() => handleImportYouTube()}
                className="flex items-center gap-3"
              >
                <i className="ri-youtube-line h-4 w-4 text-muted-foreground" />
                <span className="flex-1">
                  <Trans>Transcribe YouTube video</Trans>
                </span>
                <ShortcutById shortcutId="import-youtube-video" />
              </CommandItem>
            </CommandGroup>
          )}

          {/* Show search results when there's a query */}
          {query && (
            <>
              {/* Notes Section */}
              <CommandGroup heading={t`Notes`}>
                {isSearching && sessionMatches.length === 0
                  ? (
                    <div className="py-3 px-2 text-sm text-muted-foreground">
                      <Trans>Searching...</Trans>
                    </div>
                  )
                  : sessionMatches.length === 0
                  ? (
                    <div className="py-3 px-2 text-sm text-muted-foreground">
                      <Trans>No notes found</Trans>
                    </div>
                  )
                  : (
                    sessionMatches.map((match) => (
                      <SessionItem
                        key={`session-${match.item.id}`}
                        match={match}
                        query={query}
                        onSelect={() => handleSelectItem(match)}
                      />
                    ))
                  )}
              </CommandGroup>

              {/* Events Section */}
              <CommandGroup heading={t`Events`}>
                {isSearching && eventMatches.length === 0
                  ? (
                    <div className="py-3 px-2 text-sm text-muted-foreground">
                      <Trans>Searching...</Trans>
                    </div>
                  )
                  : eventMatches.length === 0
                  ? (
                    <div className="py-3 px-2 text-sm text-muted-foreground">
                      <Trans>No events found</Trans>
                    </div>
                  )
                  : (
                    eventMatches.map((match) => (
                      <CommandItem
                        key={`event-${match.item.id}`}
                        value={`event-${match.item.id}`}
                        className="flex items-center gap-3"
                        onSelect={() => handleSelectItem(match)}
                      >
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">
                            {highlightText(match.item.name, query)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(match.item.start_date)}
                          </span>
                        </div>
                      </CommandItem>
                    ))
                  )}
              </CommandGroup>

              {/* People Section with highlighting */}
              {
                /* TODO: Uncomment when people feature is added
          {humanMatches.length > 0 && (
            <>
              {(sessionMatches.length > 0 || eventMatches.length > 0) && <CommandSeparator />}
              <CommandGroup heading="People">
                {humanMatches.map((match) => (
                  <CommandItem
                    key={`human-${match.item.id}`}
                    value={`human-${match.item.id}`}
                    className="flex items-center gap-3"
                    onSelect={() => handleSelectItem(match)}
                  >
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span className="font-medium">
                        {highlightText(match.item.full_name || "Unknown Person", query)}
                      </span>
                      {match.item.email && (
                        <span className="text-xs text-muted-foreground">
                          {highlightText(match.item.email, query)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          */
              }

              {/* Organizations Section with highlighting */}
              {
                /* TODO: Uncomment when organizations feature is added
          {organizationMatches.length > 0 && (
            <>
              {(sessionMatches.length > 0 || eventMatches.length > 0 || humanMatches.length > 0) && (
                <CommandSeparator />
              )}
              <CommandGroup heading="Organizations">
                {organizationMatches.map((match) => (
                  <CommandItem
                    key={`org-${match.item.id}`}
                    value={`org-${match.item.id}`}
                    className="flex items-center gap-3"
                    onSelect={() => handleSelectItem(match)}
                  >
                    <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span className="font-medium">
                        {highlightText(match.item.name, query)}
                      </span>
                      {match.item.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {highlightText(match.item.description, query)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          */
              }

              {/* Show actions at bottom when searching */}
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem
                  value="create-new-note"
                  onSelect={() => handleNavigate("/app/new")}
                  className="flex items-center gap-3"
                >
                  <PlusIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Create new note</span>
                  <ShortcutById shortcutId="new-note" />
                </CommandItem>

                <CommandItem
                  value="start-transcription"
                  onSelect={() => handleNavigate("/app/new", { record: true })}
                  className="flex items-center gap-3"
                >
                  <MicIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Start new transcription</span>
                  <ShortcutById shortcutId="start-transcript" />
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
