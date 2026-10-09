import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast } from "sonner";

import { safeUnlisten } from "@/utils/safe-unlisten";

export function useTranscriptSessionEvents(sessionId: string | null) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    listen("session-event", (event: any) => {
      if (disposed) {
        return;
      }

      const payload = event.payload;
      if (payload.type === "transcriptProcessing" && payload.session_id === sessionId) {
        toast.loading(t`Enhancing transcript with speaker labels...`, {
          id: "speaker-processing",
          duration: Infinity,
        });
      } else if (payload.type === "transcriptUpdated" && payload.session_id === sessionId) {
        toast.success(t`Speaker labels added`, {
          id: "speaker-processing",
        });

        queryClient.invalidateQueries({
          queryKey: ["session", sessionId],
        });
      } else if (payload.type === "transcriptError" && payload.session_id === sessionId) {
        toast.error(t`Failed to add speaker labels`, {
          id: "speaker-processing",
        });
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "RightPanel.transcript-session-event.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register transcript listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "RightPanel.transcript-session-event");
    };
  }, [queryClient, sessionId, t]);
}
