import { Badge } from "@typr/ui/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";

interface FloatingTranscribingBadgeProps {
  isVisible: boolean;
  hasFooter?: boolean; // When true, adds more spacing from bottom for timer footer
  position?: "center" | "bottom-right"; // Option 3: Support bottom-right placement
  className?: string;
}

export function FloatingTranscribingBadge({
  isVisible,
  hasFooter = false,
  position = "center",
  className = "",
}: FloatingTranscribingBadgeProps) {
  if (!isVisible) {
    return null;
  }

  // Position classes based on placement preference
  const positionClasses = position === "bottom-right"
    ? `right-4 ${hasFooter ? "bottom-32" : "bottom-4"}`
    : `left-1/2 -translate-x-1/2 ${hasFooter ? "bottom-28" : "bottom-8"}`;

  return (
    <div
      className={`absolute z-30 pointer-events-none ${positionClasses} ${className}`}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="pointer-events-auto">
              <Badge className="bg-background hover:bg-background text-destructive shadow-lg border border-destructive/20 backdrop-blur-sm rounded-full cursor-help px-3 py-1.5">
                <div className="relative h-1.5 w-1.5 mr-2">
                  <div className="absolute inset-0 rounded-full bg-destructive" />
                  <div className="absolute inset-0 rounded-full bg-destructive animate-ping" />
                </div>
                <div className="relative overflow-hidden">
                  <div
                    className="bg-clip-text text-transparent bg-gradient-to-r from-destructive via-destructive/80 to-destructive bg-[length:200%_100%] font-medium"
                    style={{
                      animation: "shimmer-text 2s infinite linear",
                    }}
                  >
                    <Trans>Transcribing</Trans>
                  </div>
                </div>
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-center">
            <p className="text-xs">
              <Trans>
                Transcribing your speech. Words appear after natural pauses.
              </Trans>
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
