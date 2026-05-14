import { Trans } from "@lingui/react/macro";

import { RecordingIndicator } from "@/components/transcript/components/RecordingIndicator";
import { Icon } from "@/components/ui/icon";
import { useRightPanel } from "@/contexts";
import { useTranscriptionActive } from "@/hooks/useTranscriptionActive";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { ShortcutById } from "../../shortcut-by-id";

export function TranscriptPanelButton() {
  const { isViewVisible, togglePanel } = useRightPanel();
  const { isRecordingActive } = useTranscriptionActive();

  const handleClick = () => {
    togglePanel("transcript");
  };

  const isActive = isViewVisible("transcript");
  const shouldShowIndicator = isRecordingActive && !isActive;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            "text-xs relative",
            isActive && "bg-surface-400",
          )}
        >
          <Icon name="ri-subtitle-line" className="h-[18px] w-[18px] text-muted-foreground" />
          {shouldShowIndicator && (
            <div className="absolute top-1 right-1">
              <RecordingIndicator size="sm" />
            </div>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          <Trans>Open transcript panel</Trans> <ShortcutById shortcutId="toggle-transcript" />
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
