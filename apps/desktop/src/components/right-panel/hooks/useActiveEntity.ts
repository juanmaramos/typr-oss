import { useMatch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import type { ActiveEntityInfo } from "../types/chat-types";

interface UseActiveEntityProps {
  setInputValue: (value: string) => void;
  setShowHistory: (show: boolean) => void;
  setHasChatStarted: (started: boolean) => void;
  setCurrentChatGroupId?: (id: string | null) => void;
}

export function useActiveEntity({
  setInputValue,
  setShowHistory,
  setHasChatStarted,
  setCurrentChatGroupId,
}: UseActiveEntityProps) {
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const humanMatch = useMatch({ from: "/app/human/$id", shouldThrow: false });
  const organizationMatch = useMatch({ from: "/app/organization/$id", shouldThrow: false });

  // Extract primitive IDs so useMemo deps compare by value, not object identity
  const noteId = noteMatch?.params.id ?? null;
  const humanId = humanMatch?.params.id ?? null;
  const orgId = organizationMatch?.params.id ?? null;

  // Derive entity directly from route — no state, no circular deps
  const activeEntity = useMemo<ActiveEntityInfo | null>(() => {
    if (noteId) {
      return { id: noteId, type: "note" };
    }
    if (humanId) {
      return { id: humanId, type: "human" };
    }
    if (orgId) {
      return { id: orgId, type: "organization" };
    }
    return null;
  }, [noteId, humanId, orgId]);

  const sessionId = activeEntity?.type === "note" ? activeEntity.id : null;

  // Track previous entity to run side effects only on actual entity changes.
  // undefined means "not yet initialized" so we always run on first mount.
  const prevEntityRef = useRef<ActiveEntityInfo | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevEntityRef.current;
    const isFirstMount = prev === undefined;
    const isDifferentEntity = isFirstMount
      || prev?.id !== activeEntity?.id
      || prev?.type !== activeEntity?.type;

    if (!isDifferentEntity) {
      return;
    }

    prevEntityRef.current = activeEntity;

    debugLogFor("DEBUG_CHAT", "ChatDebug", "active entity changed", { from: prev, to: activeEntity });

    setInputValue("");
    setShowHistory(false);
    setHasChatStarted(false);
    setCurrentChatGroupId?.(null);
  }, [activeEntity, setInputValue, setShowHistory, setHasChatStarted, setCurrentChatGroupId]);

  return { activeEntity, sessionId };
}
