import { useRightPanel } from "@/contexts";
import { useTranscriptionActive } from "@/hooks/useTranscriptionActive";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@typr/ui/components/ui/button";

/** Both floating headers navigate through the existing panel controller. */
export function FloatingViewToggle() {
  const { t } = useLingui();
  const { currentView, switchView } = useRightPanel();
  const { isRecordingActive } = useTranscriptionActive();
  const buttonClass =
    "h-7 px-2 text-ui-label text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm";

  return (
    <div
      role="group"
      aria-label={t`Panel view`}
      className="inline-flex shrink-0 items-center rounded-surface bg-muted p-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={buttonClass}
        aria-pressed={currentView === "chat"}
        onClick={() => switchView("chat")}
      >
        <Trans>Chat</Trans>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={buttonClass}
        aria-pressed={currentView === "transcript"}
        onClick={() => switchView("transcript")}
      >
        <Trans>Transcript</Trans>
        {isRecordingActive && <span aria-hidden="true" className="size-1.5 rounded-full bg-destructive" />}
      </Button>
    </div>
  );
}
