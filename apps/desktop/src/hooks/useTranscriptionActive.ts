import { useOngoingSession } from "@typr/utils/contexts";

/**
 * A hook to determine if transcription is currently active in any session
 *
 * @returns isRecordingActive - boolean indicating if transcription is running in any session
 */
export function useTranscriptionActive() {
  const ongoingSession = useOngoingSession((s) => ({
    status: s.status,
    isActive: s.status === "running_active",
  }));

  return {
    isRecordingActive: ongoingSession.isActive,
  };
}
