import { useEffect, useMemo, useRef, useState } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { sessionWordsQueryOptions } from "@/lib/session-query";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { events as listenerEvents, type Word } from "@typr/plugin-listener";
import { useOngoingSession } from "@typr/utils/contexts";

import {
  type CommittedWordsState,
  getSessionScopedPreviews,
  getSessionScopedWords,
  type PreviewWordsState,
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
  const [previewState, setPreviewState] = useState<PreviewWordsState>({ sessionId, wordsByChannel: {} });
  const previews = isLive ? getSessionScopedPreviews(previewState, sessionId) : {};

  useEffect(() => {
    setPreviewState({ sessionId, wordsByChannel: {} });
  }, [sessionId, ongoingSessionState.status, ongoingSessionState.sessionId]);

  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  // These derived values are intentionally session-gated during render. React
  // may render once with the previous state after a route param change, but the
  // previous session's words must never be exposed to children for the new note.
  const committedWords = getSessionScopedWords(committedState, sessionId);

  const prevEventCountRef = useRef({ committed: 0 });

  const existingWords = useQuery(sessionWordsQueryOptions(sessionId));

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
      if (disposed) {
        return;
      }
      // Handle events only for the active session
      if (
        ongoingSessionState.sessionId !== sessionId
        || ongoingSessionState.status !== "running_active"
      ) {
        return;
      }

      if (payload.type === "preview") {
        if (payload.session_id !== sessionId) {
          return;
        }
        setPreviewState(previous => ({
          sessionId,
          wordsByChannel: {
            ...getSessionScopedPreviews(previous, sessionId),
            [payload.channel]: payload.words,
          },
        }));
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
        setPreviewState({ sessionId, wordsByChannel: {} });
        debugLogFor("DEBUG_TRANSCRIPT", "TranscriptDebug", "session ended; invalidating cache", { sessionId });
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
    previews,
    isLive,
    selectedLanguage,
    handleLanguageChange,
  };
}
