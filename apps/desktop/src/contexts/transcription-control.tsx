import { useParams } from "@tanstack/react-router";
import { createContext, useCallback, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { commands as listenerCommands } from "@typr/plugin-listener";
import { useOngoingSession } from "@typr/utils/contexts";

interface TranscriptionControlContextType {
  startNewTranscript: () => void;
  pauseResumeTranscript: () => void;
  stopAndSummarizeTranscript: () => void;
}

const TranscriptionControlContext = createContext<TranscriptionControlContextType | null>(null);

export function TranscriptionControlProvider({ children }: { children: React.ReactNode }) {
  // Get current session ID from route (like existing buttons do)
  const routeParams = useParams({ strict: false });
  const currentSessionId = (routeParams as any)?.id;

  // Use proper selector functions for the ongoing session store
  const ongoingSessionStore = useOngoingSession((s) => ({
    start: s.start,
    status: s.status,
  }));

  const startNewTranscript = useCallback(async () => {
    try {
      if (!currentSessionId) {
        console.log("No active session - need to be on a note page to start transcript");
        return;
      }

      console.log("Starting transcript for current session:", currentSessionId);

      // Use existing pattern - just pass the current session ID
      ongoingSessionStore.start(currentSessionId);
    } catch (error) {
      console.error("Failed to start transcript:", error);
    }
  }, [ongoingSessionStore, currentSessionId]);

  const pauseResumeTranscript = useCallback(async () => {
    try {
      const status = ongoingSessionStore.status;
      console.log("Current transcript status:", status);

      if (status === "running_active") {
        // Pause
        await listenerCommands.pauseSession();
        console.log("Transcript paused");
      } else if (status === "running_paused") {
        // Resume
        await listenerCommands.resumeSession();
        console.log("Transcript resumed");
      } else {
        console.log("No active transcript to pause/resume");
      }
    } catch (error) {
      console.error("Failed to pause/resume transcript:", error);
    }
  }, [ongoingSessionStore]);

  const stopAndSummarizeTranscript = useCallback(async () => {
    try {
      const status = ongoingSessionStore.status;
      console.log("Stopping and summarizing transcript, current status:", status);

      if (status === "running_active" || status === "running_paused") {
        // Stop the session
        await listenerCommands.stopSession();
        console.log("Transcript stopped and will be summarized");
      } else {
        console.log("No active transcript to stop");
      }
    } catch (error) {
      console.error("Failed to stop and summarize transcript:", error);
    }
  }, [ongoingSessionStore]);

  // Cmd+Shift+T / Ctrl+Shift+T for starting new transcript
  useHotkeys(
    "mod+shift+t",
    (event) => {
      console.log("🎯 SHORTCUT TRIGGERED: Cmd+Shift+T");
      event.preventDefault();
      startNewTranscript();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  // Cmd+Shift+P / Ctrl+Shift+P for pause/resume transcript (avoid Cmd+Space conflict with Spotlight)
  useHotkeys(
    "mod+shift+p",
    (event) => {
      console.log("🎯 SHORTCUT TRIGGERED: Cmd+Shift+P");
      event.preventDefault();
      pauseResumeTranscript();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  // Cmd+Shift+S / Ctrl+Shift+S for stop and summarize transcript
  useHotkeys(
    "mod+shift+s",
    (event) => {
      console.log("🎯 SHORTCUT TRIGGERED: Cmd+Shift+S");
      event.preventDefault();
      stopAndSummarizeTranscript();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <TranscriptionControlContext.Provider
      value={{ startNewTranscript, pauseResumeTranscript, stopAndSummarizeTranscript }}
    >
      {children}
    </TranscriptionControlContext.Provider>
  );
}

export function useTranscriptionControl() {
  const context = useContext(TranscriptionControlContext);
  if (!context) {
    throw new Error("useTranscriptionControl must be used within TranscriptionControlProvider");
  }
  return context;
}
