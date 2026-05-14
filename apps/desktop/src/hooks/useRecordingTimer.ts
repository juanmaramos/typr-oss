import { useEffect, useState } from "react";

import { useOngoingSession } from "@typr/utils/contexts";

export function useRecordingTimer() {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const ongoingSession = useOngoingSession((s) => ({
    status: s.status,
    sessionId: s.sessionId,
  }));

  const isActivelyRecording = ongoingSession.status === "running_active";
  const sessionId = ongoingSession.sessionId;

  useEffect(() => {
    if (!sessionId) {
      setElapsedMinutes(0);
      return;
    }

    // Get or initialize accumulated time for this session
    const storageKey = `recording_time_${sessionId}`;
    let accumulatedMinutes = parseFloat(localStorage.getItem(storageKey) || "0");
    let recordingStartTime = Date.now();

    // Set initial elapsed time
    setElapsedMinutes(accumulatedMinutes);

    if (!isActivelyRecording) {
      return;
    }

    const interval = setInterval(() => {
      const currentRecordingTime = (Date.now() - recordingStartTime) / (1000 * 60);
      const totalTime = accumulatedMinutes + currentRecordingTime;

      setElapsedMinutes(totalTime);

      // Save to localStorage every second
      localStorage.setItem(storageKey, totalTime.toString());

    }, 1000);

    // Cleanup: save final accumulated time when recording stops
    return () => {
      clearInterval(interval);
      if (isActivelyRecording) {
        const finalRecordingTime = (Date.now() - recordingStartTime) / (1000 * 60);
        const finalTotalTime = accumulatedMinutes + finalRecordingTime;
        localStorage.setItem(storageKey, finalTotalTime.toString());
      }
    };
  }, [isActivelyRecording, sessionId]);

  const remaining = 0;
  const isWarning = false;
  const isDanger = false;
  const shouldShowTimer = false;

  return {
    elapsedMinutes,
    remaining,
    isWarning,
    isDanger,
    shouldShowTimer,
    isRecording: isActivelyRecording,
  };
}
