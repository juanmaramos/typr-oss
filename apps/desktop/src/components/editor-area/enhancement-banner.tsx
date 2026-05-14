import { Loader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import { Trans } from "@lingui/react/macro";

interface EnhancementBannerProps {
  isEnhancing: boolean;
}

// Loading dots animation component for the "..." part
function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
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
  );
}

export function EnhancementBanner({
  isEnhancing,
}: EnhancementBannerProps) {
  if (!isEnhancing) {
    return null;
  }

  return (
    <div className="mx-8 mb-4 bg-primary/10 dark:bg-primary/20 rounded-md p-3 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-3">
        {/* Use existing Loader with typing animation */}
        <Loader
          variant="typing"
          size="sm"
          className="text-primary"
        />

        {/* Simple summarization progress message with animated dots */}
        <div className="flex-1">
          <span className="text-sm font-medium text-foreground">
            <Trans>Summarizing</Trans>
            <LoadingDots />
          </span>
        </div>
      </div>
    </div>
  );
}
