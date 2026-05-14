import { events as listenerEvents } from "@typr/plugin-listener";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { commands as localSttCommands } from "@typr/plugin-local-stt";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { useOngoingSession } from "@typr/utils/contexts";

import { LANGUAGE_OPTIONS } from "../components/transcript/constants/languageData";
// Remove circular dependency - we'll get handleLanguageChange differently

/**
 * Clean fallback logic for cloud transcription failures
 * Automatically switches to local models when cloud models are unavailable
 */
interface UseTranscriptionFallbackProps {
  onModelChange?: (model: string) => void;
}

export function useTranscriptionFallback(props?: UseTranscriptionFallbackProps) {
  const { t } = useLingui();
  const { userId } = useTypr();
  const reconnectToastId = "cloud-stt-reconnecting";
  const reconnectStateRef = useRef<"idle" | "scheduled" | "started">("idle");
  const ongoingSession = useOngoingSession((s) => ({
    sessionId: s.sessionId,
    status: s.status,
    start: s.start,
    stop: s.stop,
  }));

  const handleCloudFailure = useCallback(async (errorType: string, failedModel: string) => {
    // Cloud model failed - find best local fallback
    const localModels = LANGUAGE_OPTIONS.filter(o => o.isLocal);
    let bestFallback: (typeof LANGUAGE_OPTIONS)[number] | null = null;

    // Priority order: balanced (large turbo, best multilingual)
    for (const model of ["balanced"] as const) {
      const option = localModels.find(o => o.key === model);
      if (option) {
        try {
          const isDownloaded = await localSttCommands.isModelDownloaded(option.modelKey as any);
          if (isDownloaded) {
            bestFallback = option;
            break;
          }
        } catch (error) {
          console.warn(`Failed to check model ${option.key}:`, error);
        }
      }
    }

    if (bestFallback) {
      // Success: fallback available
      sonnerToast.dismiss(reconnectToastId);
      reconnectStateRef.current = "idle";
      sonnerToast.info(t`Cloud models unavailable, switching to local transcription`, {
        description: t`Continuing with ${bestFallback.label}`,
        duration: 5000, // Auto-dismiss after 5 seconds
        closeButton: true, // Add close button
      });

      // Analytics tracking
      if (userId) {
        safeAnalyticsEvent({
          event: "cloud_stt_fallback_success",
          distinct_id: userId,
          properties: {
            error_type: errorType,
            failed_model: failedModel,
            fallback_model: bestFallback.key,
          },
        });
      }

      // Switch to fallback model using direct commands (avoid circular dependencies)
      if ("modelKey" in bestFallback) {
        await localSttCommands.setCurrentModel(bestFallback.modelKey as any);
        debugLogFor("DEBUG_STT", "SttDebug", "fallback to local model", { model: bestFallback.key });

        // Restart current session with local model
        if (ongoingSession.sessionId && ongoingSession.status !== "inactive") {
          ongoingSession.stop();
          setTimeout(() => {
            ongoingSession.start(ongoingSession.sessionId!);
            debugLogFor("DEBUG_STT", "SttDebug", "session restarted with local model", { model: bestFallback.key });
          }, 500);
        }
      }
      return true;
    } else {
      // Failure: no fallback available
      sonnerToast.dismiss(reconnectToastId);
      reconnectStateRef.current = "idle";
      sonnerToast.error(t`Cloud transcription failed`, {
        description: t`Connection was lost. Download a local model in Settings → AI models for offline transcription.`,
        duration: 10000, // Longer duration for error
        closeButton: true,
      });

      // Analytics tracking
      if (userId) {
        safeAnalyticsEvent({
          event: "cloud_stt_fallback_failed",
          distinct_id: userId,
          properties: {
            error_type: errorType,
            failed_model: failedModel,
            reason: "no_local_models_downloaded",
          },
        });
      }

      return false;
    }
  }, [t, userId, ongoingSession]);

  // Listen for backend failure events
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    listenerEvents.sessionEvent.listen(({ payload }) => {
      if (payload.type === "cloudTranscriptionFailed" as any) {
        const cloudFailure = payload as {
          reason?: string;
          failed_model?: string;
          message?: string;
        };

        const reason = cloudFailure.reason || "connection_failure";
        const failedModel = cloudFailure.failed_model || "assemblyai-universal";

        handleCloudFailure(reason, failedModel);
      } else if (payload.type === "cloudTranscriptionRecovery" as any) {
        const recovery = payload as {
          phase?: string;
          reason?: string;
          attempt?: number;
          max_attempts?: number;
        };

        const phase = recovery.phase || "scheduled";
        const attempt = recovery.attempt || 1;
        const maxAttempts = recovery.max_attempts || 1;

        if (phase === "scheduled" || phase === "started") {
          if (reconnectStateRef.current === "idle" || phase === "started") {
            reconnectStateRef.current = phase === "started" ? "started" : "scheduled";
            sonnerToast.info(t`Connection lost. Reconnecting transcription…`, {
              id: reconnectToastId,
              description: t`Attempt ${attempt} of ${maxAttempts}`,
              duration: Infinity,
              closeButton: true,
            });
          }
        } else if (phase === "succeeded") {
          sonnerToast.dismiss(reconnectToastId);
          reconnectStateRef.current = "idle";
          sonnerToast.success(t`Transcription reconnected`, {
            duration: 2500,
            closeButton: true,
          });
        } else if (phase === "exhausted") {
          sonnerToast.dismiss(reconnectToastId);
          reconnectStateRef.current = "idle";
        }
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "useTranscriptionFallback.sessionEvent.listener.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register transcription fallback listener", error);
    });

    return () => {
      disposed = true;
      sonnerToast.dismiss(reconnectToastId);
      safeUnlisten(unlisten, "useTranscriptionFallback.sessionEvent.listener");
    };
  }, [handleCloudFailure]);

  // When the session ends, clear any transient session model override so the next
  // session starts fresh with the user's persisted preference.
  useEffect(() => {
    if (ongoingSession.status === "inactive") {
      import("@typr/plugin-connector").then(({ commands: connectorCommands }) => {
        connectorCommands.clearSttModelSession().catch((err) => {
          console.warn("[FALLBACK] Failed to clear session model override:", err);
        });
      });
    }
  }, [ongoingSession.status]);

  return { handleCloudFailure };
}
