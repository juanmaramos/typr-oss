import GoogleMeetWaveform from "@/components/ui/google-meet-waveform";
import { Icon } from "@/components/ui/icon";
import { Loader } from "@/components/ui/loader";
import { useRecordingTimer } from "@/hooks/useRecordingTimer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession } from "@typr/utils/contexts";
import { useState } from "react";

interface PlayerControlsProps {
  sessionId: string;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: () => Promise<void>;
}

export function PlayerControls({ sessionId, onPause, onResume, onStop }: PlayerControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const ongoingSession = useOngoingSession((s) => ({
    status: s.status,
    sessionId: s.sessionId,
  }));

  const { elapsedMinutes } = useRecordingTimer();

  const isActive = ongoingSession.status === "running_active" && sessionId === ongoingSession.sessionId;
  const isPaused = ongoingSession.status === "running_paused" && sessionId === ongoingSession.sessionId;

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const handlePause = async () => {
    console.log("⏸️ [PlayerControls] Setting loading=true");
    setIsLoading(true);
    try {
      await onPause();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    console.log("▶️ [PlayerControls] Setting loading=true");
    setIsLoading(true);
    try {
      await onResume();
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    console.log("🛑 [PlayerControls] Setting loading=true");
    setIsLoading(true);
    try {
      await onStop();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-9 items-center gap-1.5 rounded-full border border bg-background px-1.5 shadow-sm">
      <div className="flex h-7 items-center gap-2.5 rounded-full bg-muted/50 px-2.5">
        <GoogleMeetWaveform
          isRecording={isActive}
          input="all"
          size="compact"
          color="blue-dark"
        />
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatTime(elapsedMinutes)}
        </span>
      </div>

      {isActive && (
        <button
          onClick={handlePause}
          disabled={isLoading}
          className={cn(
            "group relative h-7 w-7 rounded-full transition-all duration-150",
            "border border-transparent bg-transparent",
            "hover:border hover:bg-surface-400/50",
            "active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isLoading
            ? (
              <Loader
                variant="pulse-dot"
                size="sm"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            )
            : (
              <Icon
                name="ri-pause-fill"
                className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-foreground/80"
              />
            )}
        </button>
      )}

      {isPaused && (
        <button
          onClick={handleResume}
          disabled={isLoading}
          className={cn(
            "group relative h-7 w-7 rounded-full transition-all duration-150",
            "border border-transparent bg-transparent",
            "hover:border hover:bg-surface-400/50",
            "active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isLoading
            ? (
              <Loader
                variant="pulse-dot"
                size="sm"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            )
            : (
              <Icon
                name="ri-play-fill"
                className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-[45%] -translate-y-1/2 text-foreground/80"
              />
            )}
        </button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleStop}
            disabled={isLoading}
            className={cn(
              "group relative h-7 w-7 rounded-full transition-all duration-150",
              "border border-transparent bg-transparent",
              "hover:border-destructive/20 hover:bg-destructive/10",
              "active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isLoading
              ? (
                <Loader
                  variant="pulse-dot"
                  size="sm"
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-destructive"
                />
              )
              : (
                <Icon
                  name="ri-stop-fill"
                  className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-destructive"
                />
              )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Stop</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
