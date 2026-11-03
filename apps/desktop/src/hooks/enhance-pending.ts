import { useMutationState } from "@tanstack/react-query";
import { useMemo } from "react";

import { useBackgroundEnhanceStore } from "@/stores/background-enhance";

export function useEnhancePendingState(sessionId: string) {
  const isBackgroundPending = useBackgroundEnhanceStore((s) => !!s.phases[sessionId]);
  const enhanceStates = useMutationState({
    filters: { mutationKey: ["enhance", sessionId], exact: true },
    select: (mutation) => mutation.state.status,
  });

  const isEnhancePending = useMemo(
    () => enhanceStates.some((s) => s === "pending"),
    [enhanceStates],
  );

  return isEnhancePending || isBackgroundPending;
}

export function useTitleGenerationPendingState(sessionId: string) {
  const titleStates = useMutationState({
    filters: { mutationKey: ["generateTitle", sessionId], exact: true },
    select: (mutation) => mutation.state.status,
  });

  const isTitleGenerationPending = useMemo(
    () => titleStates.some((s) => s === "pending"),
    [titleStates],
  );

  return isTitleGenerationPending;
}
