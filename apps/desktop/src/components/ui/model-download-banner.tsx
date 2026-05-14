import { useLingui } from "@lingui/react/macro";
import { BrainIcon } from "lucide-react";

import { useLocalModels } from "@/hooks/useModels";
import { Spinner } from "@typr/ui/components/ui/spinner";

interface ModelDownloadBannerProps {
  className?: string;
}

export function ModelDownloadBanner({ className }: ModelDownloadBannerProps) {
  const { t } = useLingui();
  const { models } = useLocalModels();

  // Check if any model is currently downloading
  const isAnyModelDownloading = models.some(model => model.isDownloading);

  if (!isAnyModelDownloading) {
    return null;
  }

  return (
    <div className={`mx-4 mb-4 ${className}`}>
      <div className="bg-info/5 dark:bg-info/10 border border-info/30 dark:border-info/40 rounded-lg p-4">
        <div className="flex items-center gap-3">
          {/* Animated Spinner */}
          <div className="flex-shrink-0">
            <Spinner className="size-5 text-info dark:text-info/80" />
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="font-medium text-info dark:text-info/80 text-sm">
              {t`Setting up AI assistant`}
            </div>
            <div className="text-info dark:text-info/80 text-xs mt-0.5">
              {t`You'll be able to chat when the download completes`}
            </div>
          </div>

          {/* Icon */}
          <div className="flex-shrink-0">
            <BrainIcon className="h-4 w-4 text-info dark:text-info/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
