import { useOngoingSession } from "@typr/utils/contexts";
import { useTranscriptWidget } from "../../right-panel/hooks/useTranscriptWidget";

export type TranscriptState = "empty" | "active" | "stopped";

export function useTranscriptState(sessionId: string | null) {
  const ongoingSession = useOngoingSession((s) => ({
    status: s.status,
    sessionId: s.sessionId,
    isInactive: s.status === "inactive",
    isActive: s.status === "running_active",
    isPaused: s.status === "running_paused",
  }));

  const { hasTranscript, showEmptyMessage } = useTranscriptWidget(sessionId);

  const transcriptState: TranscriptState = (() => {
    // Empty state: No transcript and session is inactive
    if (showEmptyMessage && ongoingSession.isInactive) {
      return "empty";
    }

    // Active state: Currently recording (active or paused)
    if (
      sessionId === ongoingSession.sessionId
      && (ongoingSession.isActive || ongoingSession.isPaused)
    ) {
      return "active";
    }

    // Stopped state: Has transcript and session is inactive
    if (hasTranscript && sessionId && ongoingSession.isInactive) {
      return "stopped";
    }

    // Default to empty if we can't determine state
    return "empty";
  })();

  // Only allow model changes when session is completely inactive
  // Changing during pause would require tearing down and rebuilding the pipeline
  const isLanguageChangeable = ongoingSession.isInactive;
  const isRecordingActive = ongoingSession.isActive && sessionId === ongoingSession.sessionId;

  return {
    transcriptState,
    ongoingSession,
    hasTranscript,
    showEmptyMessage,
    isLanguageChangeable,
    isRecordingActive,
  };
}
