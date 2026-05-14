import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { useRightPanel } from "@/contexts";
import { useAudioUploadStore } from "@/stores/audio-upload";
import { Button } from "@typr/ui/components/ui/button";
import { Progress } from "@typr/ui/components/ui/progress";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { useSessions } from "@typr/utils/contexts";

const TOAST_ID = "audio-upload-progress";

export function AudioUploadToastObserver() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { hidePanel } = useRightPanel();
  const sessionsStore = useSessions((s) => s.sessions);
  const progress = useAudioUploadStore((s) => s.progress);
  const setProgress = useAudioUploadStore((s) => s.setProgress);
  const prevStatusRef = useRef(progress.status);

  const progressValue = progress.status === "processing" && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const estimatedTimeRemaining = useMemo(() => {
    if (progress.status !== "processing" || progress.total === 0 || progress.current === 0) {
      return null;
    }
    const elapsed = Date.now() - progress.startedAt;
    const rate = progress.current / elapsed;
    const remainingMs = (progress.total - progress.current) / rate;
    if (remainingMs < 5000) {
      return null;
    }
    if (remainingMs < 60000) {
      return t`~${Math.ceil(remainingMs / 1000)}s remaining`;
    }
    return t`~${Math.ceil(remainingMs / 60000)}m remaining`;
  }, [progress, t]);

  const navigateToNote = (sessionId: string) => {
    navigate({ to: "/app/note/$id", params: { id: sessionId } });
    // Switch to AI Summary tab by setting showRaw=false on the session store
    const sessionStore = sessionsStore[sessionId];
    if (sessionStore) {
      sessionStore.getState().setShowRaw(false);
    }
    // Collapse transcript panel so user sees the clean AI summary
    hidePanel();
    sonnerToast.dismiss(TOAST_ID);
    setProgress({ status: "idle" });
  };

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = progress.status;

    if (progress.status === "processing") {
      const indeterminate = progress.indeterminate ?? false;
      sonnerToast.custom(
        () => (
          <AudioUploadToastContent
            progressValue={progressValue}
            estimatedTimeRemaining={estimatedTimeRemaining}
            fileName={progress.fileName}
            indeterminate={indeterminate}
            onCancel={() => {
              setProgress({ status: "idle" });
              sonnerToast.dismiss(TOAST_ID);
            }}
          />
        ),
        { id: TOAST_ID, duration: Infinity, dismissible: false },
      );
    } else if (progress.status === "done" && prev === "processing") {
      const sessionId = progress.sessionId;
      sonnerToast.custom(
        () => (
          <AudioUploadDoneContent
            onView={() => navigateToNote(sessionId)}
            onDismiss={() => {
              sonnerToast.dismiss(TOAST_ID);
              setProgress({ status: "idle" });
            }}
          />
        ),
        { id: TOAST_ID, duration: Infinity, dismissible: true },
      );
    } else if (progress.status === "enhanced" && (prev === "done" || prev === "processing")) {
      const sessionId = progress.sessionId;
      sonnerToast.custom(
        () => (
          <AudioUploadEnhancedContent
            onView={() => navigateToNote(sessionId)}
            onDismiss={() => {
              sonnerToast.dismiss(TOAST_ID);
              setProgress({ status: "idle" });
            }}
          />
        ),
        { id: TOAST_ID, duration: 8000, dismissible: true },
      );
    } else if (progress.status === "error" && prev === "processing") {
      sonnerToast.dismiss(TOAST_ID);
    } else if (progress.status === "idle" && prev !== "idle") {
      sonnerToast.dismiss(TOAST_ID);
    }
  }, [progress, progressValue, estimatedTimeRemaining, setProgress, navigate, hidePanel, sessionsStore]);

  return null;
}

function AudioUploadToastContent({
  progressValue,
  estimatedTimeRemaining,
  fileName,
  indeterminate,
  onCancel,
}: {
  progressValue: number;
  estimatedTimeRemaining: string | null;
  fileName: string;
  indeterminate: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="group w-[300px] overflow-clip rounded-lg">
      <div className="relative flex flex-col gap-2 rounded-lg border-0 bg-background p-4 text-foreground shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <i className="ri-loader-4-line text-base text-muted-foreground animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                <Trans>Transcribing audio…</Trans>
              </p>
              <p className="text-xs text-muted-foreground truncate">{fileName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
        {indeterminate
          ? (
            <p className="text-xs text-muted-foreground animate-pulse">
              <Trans>Transcribing — this may take a moment…</Trans>
            </p>
          )
          : (
            <div className="space-y-1">
              <Progress value={progressValue} className="h-1" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progressValue}%</span>
                {estimatedTimeRemaining && <span>{estimatedTimeRemaining}</span>}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function AudioUploadDoneContent({ onView, onDismiss }: { onView: () => void; onDismiss: () => void }) {
  return (
    <div className="group w-[300px] overflow-clip rounded-lg">
      <div className="relative flex flex-col gap-2 rounded-lg border-0 bg-background p-4 text-foreground shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <i className="ri-loader-4-line text-base text-muted-foreground animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium">
                <Trans>Transcription complete</Trans>
              </p>
              <p className="text-xs text-muted-foreground">
                <Trans>AI summary is being generated…</Trans>
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={onDismiss}>
            <Trans>Dismiss</Trans>
          </Button>
          <Button variant="default" size="sm" className="h-7 px-3 text-xs" onClick={onView}>
            <Trans>View note</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AudioUploadEnhancedContent({ onView, onDismiss }: { onView: () => void; onDismiss: () => void }) {
  return (
    <div className="group w-[300px] overflow-clip rounded-lg">
      <div className="relative flex flex-col gap-2 rounded-lg border-0 bg-background p-4 text-foreground shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <i className="ri-check-line text-base text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                <Trans>AI summary is ready</Trans>
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={onDismiss}>
            <Trans>Dismiss</Trans>
          </Button>
          <Button variant="default" size="sm" className="h-7 px-3 text-xs" onClick={onView}>
            <Trans>View note</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
