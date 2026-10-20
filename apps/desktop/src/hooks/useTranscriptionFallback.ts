import { events as listenerEvents } from "@typr/plugin-listener";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { commands as localSttCommands, type SupportedModel } from "@typr/plugin-local-stt";
import { commands as connectorCommands } from "@typr/plugin-connector";
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
  const pendingFallback = useRef<{
    sessionId: string;
    model: SupportedModel;
    phase: "stopping" | "preparing" | "starting";
  } | null>(null);
  const checkingFallback = useRef(false);
  const ownedOverride = useRef<string | null>(null);
  const clearOverride = useCallback(async (sessionId = ownedOverride.current) => {
    if (!sessionId) {
      return;
    }
    await connectorCommands.clearSttModelSession(sessionId);
    if (ownedOverride.current === sessionId) {
      ownedOverride.current = null;
    }
  }, []);
  const mounted = useRef(true);
  const ongoingSession = useOngoingSession((s) => ({
    sessionId: s.sessionId,
    status: s.status,
    loading: s.loading,
    start: s.start,
    stop: s.stop,
  }));

  const currentSession = useRef(ongoingSession);
  currentSession.current = ongoingSession;

  const handleCloudFailure = useCallback(async (errorType: string, failedModel: string) => {
    const failedSessionId = currentSession.current.sessionId;
    if (!failedSessionId || currentSession.current.status === "inactive" || currentSession.current.loading || checkingFallback.current || pendingFallback.current) {
      return false;
    }
    checkingFallback.current = true;
    // Cloud model failed - find best local fallback
    const localModels = LANGUAGE_OPTIONS.filter(o => o.isLocal);
    let bestFallback: (typeof LANGUAGE_OPTIONS)[number] | null = null;

    // Priority order: balanced (large turbo, best multilingual)
    for (const model of ["balanced"] as const) {
      const option = localModels.find(o => o.key === model);
      if (option) {
        try {
          const isDownloaded = await localSttCommands.isModelDownloaded(option.modelKey as SupportedModel);
          if (isDownloaded) {
            bestFallback = option;
            break;
          }
        } catch (error) {
          console.warn(`Failed to check model ${option.key}:`, error);
        }
      }
    }

    checkingFallback.current = false;
    const latestSession = { ...currentSession.current };
    if (!mounted.current || latestSession.sessionId !== failedSessionId || latestSession.status === "inactive" || latestSession.loading) {
      return false;
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

      if ("modelKey" in bestFallback) {
        pendingFallback.current = {
          sessionId: failedSessionId,
          model: bestFallback.modelKey as SupportedModel,
          phase: "stopping",
        };
        currentSession.current.stop();
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
  }, [t, userId]);

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

  // Native overrides belong to one recording session. Wait for stop to finish,
  // then install recovery for that session before asking the native runtime to start it.
  useEffect(() => {
    if (ongoingSession.loading) {
      return;
    }
    const pending = pendingFallback.current;
    if (ongoingSession.status !== "inactive") {
      if (pending?.phase !== "preparing") {
        pendingFallback.current = null;
      }
      if (ownedOverride.current && ongoingSession.sessionId !== ownedOverride.current) {
        void clearOverride().catch(console.error);
      }
      return;
    }
    if (pending?.phase === "preparing") {
      return;
    }
    if (pending?.phase === "stopping") {
      pending.phase = "preparing";
      ownedOverride.current = pending.sessionId;
      void (async () => {
        await connectorCommands.setSttModelSession(pending.sessionId, pending.model);
        const current = currentSession.current;
        if (!mounted.current || current.status !== "inactive" || current.loading) {
          pendingFallback.current = null;
          await clearOverride(pending.sessionId);
          return;
        }
        pending.phase = "starting";
        current.start(pending.sessionId);
        debugLogFor("DEBUG_STT", "SttDebug", "session restarted with local model", { model: pending.model });
      })().catch((error) => {
        pendingFallback.current = null;
        void clearOverride(pending.sessionId).catch(console.error);
        console.error("[FALLBACK] Local recovery failed:", error);
        sonnerToast.error(t`Cloud transcription failed`);
      });
      return;
    }
    pendingFallback.current = null;
    void clearOverride().catch((error) => {
      console.warn("[FALLBACK] Failed to clear session model override:", error);
    });
  }, [ongoingSession.status, ongoingSession.loading, ongoingSession.sessionId, clearOverride, t]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingFallback.current = null;
      void clearOverride().catch(console.error);
    };
  }, [clearOverride]);

  return { handleCloudFailure };
}
