import { cn } from "@/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { X } from "lucide-react";
import { motion } from "motion/react";

type StreamingPhase = "idle" | "starting" | "streaming" | "finishing";

interface WritingBarOverlayProps {
  sessionId: string;
  phase: StreamingPhase;
  onCancel?: () => void;
}

function TypingLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-1", className)}>
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.1s" }}
      />
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.2s" }}
      />
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );
}

function PhaseLabel({ phase }: { phase: StreamingPhase }) {
  switch (phase) {
    case "starting":
      return <Trans>Preparing notes</Trans>;
    case "streaming":
      return <Trans>Writing notes</Trans>;
    case "finishing":
      return <Trans>Finalizing</Trans>;
    default:
      return <Trans>Writing</Trans>;
  }
}

export function WritingBarOverlay({ sessionId, phase, onCancel }: WritingBarOverlayProps) {
  const { t } = useLingui();

  return (
    <div className="pointer-events-none relative z-[8]">
      <motion.div
        data-session-id={sessionId}
        className="pointer-events-none"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{
          opacity: { duration: 0.2 },
          y: { duration: 0.3, ease: "easeOut" },
        }}
      >
        <div
          className={cn(
            "group relative overflow-hidden",
            "bg-background/95 border border-border rounded-lg p-3 shadow-[0_2px_8px_rgba(0,0,0,0.12)] pointer-events-auto backdrop-blur-sm",
          )}
        >
          {/* Shimmer highlight */}
          <div
            className="absolute inset-0 animate-[shimmer_2s_ease-in-out_infinite]"
            style={{
              background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.06) 50%, transparent 100%)",
            }}
          />

          <div className="relative flex items-center gap-3">
            <TypingLoader className="text-primary" />
            <div className="flex-1">
              <span className="text-sm font-semibold text-foreground">
                <PhaseLabel phase={phase} />
                <span className="inline-flex">
                  <span
                    className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60"
                    style={{ animationDelay: "0s" }}
                  >
                    .
                  </span>
                  <span
                    className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60"
                    style={{ animationDelay: "0.2s" }}
                  >
                    .
                  </span>
                  <span
                    className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60"
                    style={{ animationDelay: "0.4s" }}
                  >
                    .
                  </span>
                </span>
              </span>
            </div>
            {onCancel ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t`Cancel and restore previous notes`}
                    onClick={onCancel}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                      "opacity-0 transition-[opacity,background-color,color] duration-150",
                      "hover:bg-muted hover:text-foreground",
                      "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "group-hover:opacity-100",
                    )}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <Trans>Cancel and restore previous notes</Trans>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
