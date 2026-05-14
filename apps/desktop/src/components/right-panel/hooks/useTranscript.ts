import { useEffect, useMemo, useRef, useState } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { commands as dbCommands } from "@typr/plugin-db";
import { events as listenerEvents, type Word } from "@typr/plugin-listener";
import { useOngoingSession } from "@typr/utils/contexts";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CommittedWordsState,
  getSessionScopedWords,
} from "./transcript-state";

const shortSessionId = (id: string | null | undefined) => id?.slice(-8) ?? "none";

export function useTranscript(sessionId: string | null, caller?: string) {
  const tag = caller ? `useTranscript[${caller}]` : "useTranscript";
  const queryClient = useQueryClient();
  const ongoingSessionState = useOngoingSession((s) => ({
    status: s.status,
    sessionId: s.sessionId,
  }));
  // const isEnhanced = sessionId ? useSession(sessionId, (s) => !!s.session.enhanced_memo_html) : false;

  const isLive = useMemo(() =>
    ongoingSessionState.status === "running_active"
    && ongoingSessionState.sessionId === sessionId, [
    ongoingSessionState.status,
    ongoingSessionState.sessionId,
    sessionId,
  ]);

  const [committedState, setCommittedState] = useState<CommittedWordsState>({
    sessionId,
    words: [],
  });
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  // These derived values are intentionally session-gated during render. React
  // may render once with the previous state after a route param change, but the
  // previous session's words must never be exposed to children for the new note.
  const committedWords = getSessionScopedWords(committedState, sessionId);

  const prevEventCountRef = useRef({ committed: 0 });

  const existingWords = useQuery({
    enabled: !!sessionId,
    queryKey: ["session", "words", sessionId],
    queryFn: async () => {
      // Get words directly from session instead of separate words table
      try {
        const session = await dbCommands.getSession({ id: sessionId! });
        return session?.words || [];
      } catch (error) {
        console.error("Failed to fetch session:", error);
        return [];
      }
    },
  });

  useEffect(() => {
    if (!sessionId) {
      setCommittedState({ sessionId: null, words: [] });
      prevEventCountRef.current = { committed: 0 };
      return;
    }

    if (existingWords.data && !existingWords.isPlaceholderData) {
      debugLogFor(
        "DEBUG_TRANSCRIPT",
        tag,
        `query loaded route=${
          shortSessionId(sessionId)
        } words=${existingWords.data.length} updatedAt=${existingWords.dataUpdatedAt}`,
      );
      setCommittedState({ sessionId, words: existingWords.data });
      prevEventCountRef.current = { committed: existingWords.data.length };
    }
  }, [existingWords.data, existingWords.isPlaceholderData, sessionId]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    listenerEvents.sessionEvent.listen(({ payload }) => {
      // Handle events only for the active session
      if (
        ongoingSessionState.sessionId !== sessionId
        || ongoingSessionState.status !== "running_active"
      ) {
        return;
      }

      // Handle Final Commit (Saved to DB)
      if (payload.type === "words") {
        const newCommitted = payload.words as Word[];
        const previous = prevEventCountRef.current.committed;
        if (newCommitted.length !== previous) {
          debugLogFor("DEBUG_TRANSCRIPT", "TranscriptDebug", "words", {
            sessionId: shortSessionId(sessionId),
            committed: newCommitted.length,
            delta: newCommitted.length - previous,
          });
          prevEventCountRef.current.committed = newCommitted.length;
        }
        setCommittedState({ sessionId, words: newCommitted });
      } // Handle Session End
      else if (payload.type === "inactive" && sessionId) {
        debugLogFor("DEBUG_TRANSCRIPT", "TranscriptDebug", "session ended; invalidating cache", { sessionId });
        queryClient.invalidateQueries({ queryKey: ["session", "words", sessionId] });
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "useTranscript.sessionEvent.listener.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register transcript listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "useTranscript.sessionEvent.listener");
    };
  }, [ongoingSessionState.status, ongoingSessionState.sessionId, sessionId, queryClient]);

  const handleLanguageChange = (value: string) => {
    setSelectedLanguage(value);
  };

  return {
    words: committedWords,
    isLive,
    selectedLanguage,
    handleLanguageChange,
  };
}
