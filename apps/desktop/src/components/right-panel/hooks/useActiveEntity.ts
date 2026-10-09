import { useMatch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import type { ActiveEntityInfo } from "../types/chat-types";

interface UseActiveEntityProps {
  setInputValue: (value: string) => void;
}

export function useActiveEntity({ setInputValue }: UseActiveEntityProps) {
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

  // Track previous entity to reset only the local input when its session changes.
  // Other chat UI and group state is session-scoped and must survive view remounts.
  const prevEntityRef = useRef<ActiveEntityInfo | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevEntityRef.current;
    const isDifferentEntity = prev === undefined
      || prev?.id !== activeEntity?.id
      || prev?.type !== activeEntity?.type;

    if (!isDifferentEntity) {
      return;
    }

    prevEntityRef.current = activeEntity;

    debugLogFor("DEBUG_CHAT", "ChatDebug", "active entity changed", { from: prev, to: activeEntity });

    setInputValue("");
  }, [activeEntity, setInputValue]);

  return { activeEntity, sessionId };
}
