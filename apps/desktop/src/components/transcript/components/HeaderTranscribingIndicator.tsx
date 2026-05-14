import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";

interface HeaderTranscribingIndicatorProps {
  isVisible: boolean;
  className?: string;
}

/**
 * Option 1: Header Integration
 * Small, unobtrusive indicator placed in the top-right area next to action buttons
 * Linear.app style - minimal, functional, always visible
 */
export function HeaderTranscribingIndicator({
  isVisible,
  className = "",
}: HeaderTranscribingIndicatorProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 bg-destructive/5 hover:bg-destructive/10 rounded-full cursor-help transition-colors border border-destructive/20 ${className}`}
          >
            <div className="relative h-1.5 w-1.5 flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-destructive" />
              <div className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
            </div>
            <span className="text-xs font-medium text-destructive">
              <Trans>Live</Trans>
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-center">
          <p className="text-xs">
            <Trans>
              Words appear after pauses in speech. Keep talking naturally—the AI processes in batches for better
              accuracy.
            </Trans>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
