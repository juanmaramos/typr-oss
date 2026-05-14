import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

// Shared component for the toast content with copy functionality
function ConsentNotificationContent({ onDontShowAgain }: { onDontShowAgain: () => void }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLingui();

  const transcriptionNoticeMessage =
    t`I'm using www.typrapp.com to take notes. It transcribes the meeting but doesn't record it. If you prefer not to be transcribed just let me know.`;

  const handleCopyNotice = async () => {
    try {
      await navigator.clipboard.writeText(transcriptionNoticeMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy transcription notice:", error);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <span>
          <Trans>
            Please inform all participants that this session is being transcribed for meeting summarization purposes.
          </Trans>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyNotice}
          className="text-xs h-7"
        >
          <i className={`ri-file-copy-line text-sm mr-1.5 ${copied ? "text-primary" : ""}`} />
          {copied ? <Trans>Copied!</Trans> : <Trans>Copy notice</Trans>}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <i className="ri-information-line text-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-48">
              <p className="text-xs">{transcriptionNoticeMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );
}

/**
 * Custom hook for showing the consent notification toast with proper translations
 *
 * Usage:
 * const showConsentNotification = useConsentNotification();
 *
 * // Later in useEffect or event handler:
 * showConsentNotification();
 */
export function useConsentNotification() {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const handleDontShowAgain = useCallback(async () => {
    try {
      // Get current config
      const config = await dbCommands.getConfig();

      // Update config to disable consent notification
      await dbCommands.setConfig({
        ...config,
        general: {
          ...config.general,
          show_consent_notification: false,
        },
      });

      // Invalidate config queries to update UI
      queryClient.invalidateQueries({ queryKey: ["config"] });

      // Dismiss the toast
      sonnerToast.dismiss("recording-consent-reminder");

      console.log("[Consent] Notification disabled via toast action");
    } catch (error) {
      console.error("[Consent] Failed to disable notification:", error);
    }
  }, [queryClient]);

  return useCallback(() => {
    toast({
      id: "recording-consent-reminder",
      title: t`Transcription started`,
      content: <ConsentNotificationContent onDontShowAgain={handleDontShowAgain} />,
      buttons: [
        {
          label: t`I've notified participants`,
          onClick: () => {
            sonnerToast.dismiss("recording-consent-reminder");
          },
          primary: true,
        },
      ],
      dismissible: true,
      duration: 18000,
      children: (
        <button
          onClick={handleDontShowAgain}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left w-full mt-2"
        >
          <Trans>Don't remind me again</Trans>
        </button>
      ),
    });
  }, [t, handleDontShowAgain]);
}
