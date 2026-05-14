import { Badge } from "@typr/ui/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";

import { useRecordingTimer } from "@/hooks/useRecordingTimer";

export function ListeningIndicator() {
  const { remaining, isWarning, isDanger, shouldShowTimer } = useRecordingTimer();

  useEffect(() => {
    const dotAnimation = [".", "..", "..."];
    let currentDotIndex = 0;
    const intervalId = setInterval(() => {
      currentDotIndex = (currentDotIndex + 1) % dotAnimation.length;
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center justify-center py-3 pb-4 gap-2">
      {/* Transcribing Badge with Tooltip */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-destructive/10 hover:bg-destructive/10 text-destructive shadow-none rounded-full cursor-help">
              <div className="relative h-1.5 w-1.5 mr-2">
                <div className="absolute inset-0 rounded-full bg-destructive" />
                <div className="absolute inset-0 rounded-full bg-destructive animate-ping" />
              </div>
              <div className="relative overflow-hidden">
                <div
                  className="bg-clip-text text-transparent bg-gradient-to-r from-destructive via-destructive/80 to-destructive bg-[length:200%_100%]"
                  style={{
                    animation: "shimmer-text 2s infinite linear",
                  }}
                >
                  <Trans>Transcribing</Trans>
                </div>
              </div>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-center">
            <p className="text-xs">
              <Trans>
                Words appear after pauses in speech. Keep talking naturally—the AI processes in batches for better
                accuracy.
              </Trans>
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Timer for Free Users */}
      {shouldShowTimer && (
        <div className="flex flex-col items-center gap-1.5">
          {/* Clean Timer Badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              !isWarning && "bg-surface-400 text-muted-foreground",
              isWarning && !isDanger && "bg-warning/10 text-warning",
              isDanger && "bg-destructive/10 text-destructive",
            )}
          >
            <i
              className={cn(
                "ri-timer-line text-sm",
                !isWarning && "text-muted-foreground",
                isWarning && !isDanger && "text-warning",
                isDanger && "text-destructive",
              )}
            />
            <span>
              {formatTime(remaining)} <Trans>remaining</Trans>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
