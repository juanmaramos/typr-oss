import { useAIAvailability } from "@/hooks/useAIAvailability";
import { useModelAvailabilityLabel } from "@/hooks/useModelAvailabilityLabel";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@typr/ui/components/ui/button";

interface AISetupIndicatorProps {
  className?: string;
}

export function AISetupIndicator({ className }: AISetupIndicatorProps) {
  const { t } = useLingui();
  const { availability, retry } = useAIAvailability();
  const statusLabel = useModelAvailabilityLabel();
  if (availability.canStart) {
    return null;
  }
  const downloading = availability.status === "downloading";
  return (
    <div role="status" className={`w-full bg-info/5 dark:bg-info/10 ${className ?? ""}`}>
      <div className="px-4 py-2 flex items-center gap-3">
        <span aria-hidden="true" className="relative flex size-3.5 items-center justify-center shrink-0">
          {downloading && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/35 dark:bg-info/35" />
          )}
          <span className="relative inline-flex size-2 rounded-full bg-info dark:bg-info/80" />
        </span>
        <span className="text-xs text-foreground font-medium">
          {availability.status === "needs-download"
            ? t`Download the selected model or choose another model below.`
            : statusLabel(availability)}
        </span>
        {availability.canRetry && <Button variant="ghost" size="sm" onClick={() => void retry()}>{t`Retry`}</Button>}
      </div>
    </div>
  );
}
