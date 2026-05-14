import { useLingui } from "@lingui/react/macro";

import { useAIAvailability } from "@/hooks/useAIAvailability";
import { usePlatform } from "@/hooks/usePlatform";

interface AISetupIndicatorProps {
  className?: string;
}

export function AISetupIndicator({ className }: AISetupIndicatorProps) {
  const { t } = useLingui();
  const { supportsLocalModels } = usePlatform();

  const { hasUsableModel, isLocalModelDownloading, isCheckingAvailability } = useAIAvailability();

  // On Windows, cloud models are always available - don't show this indicator
  if (!supportsLocalModels) {
    return null;
  }

  // Don't show setup banners when AI is already usable.
  if (isCheckingAvailability || hasUsableModel) {
    return null;
  }

  // Show banner only when user is actually blocked.
  if (isLocalModelDownloading || (!hasUsableModel && !isCheckingAvailability)) {
    return (
      <div className={`w-full bg-info/5 dark:bg-info/10 ${className}`}>
        <div className="px-4 py-2 flex items-center gap-3">
          <span className="relative flex size-3.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/35 dark:bg-info/35" />
            <span className="relative inline-flex size-2 rounded-full bg-info dark:bg-info/80" />
          </span>
          <span className="text-xs text-info-foreground dark:text-info/80 font-medium">
            {isLocalModelDownloading
              ? t`Setting up offline AI models - you'll be able to chat soon`
              : t`No local AI models available - download one in the models selector below`}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
