import { cn } from "@/lib/utils";
import { useLingui } from "@lingui/react/macro";
import * as Tooltip from "@radix-ui/react-tooltip";

interface InlineCitationProps {
  number: number;
  sourceId: string;
  sourceUrl?: string;
  className?: string;
}

/**
 * Inline citation component for displaying source references
 * Renders as [1], [2], etc. with hover tooltip showing source details
 */
export function InlineCitation({ number, sourceId, sourceUrl, className }: InlineCitationProps) {
  const { t } = useLingui();

  // Parse source ID to extract meaningful information
  // Format: "L79-L82" or "source-name"
  const isLineRange = sourceId.match(/^L(\d+)(?:-L(\d+))?$/);

  let tooltipContent = sourceId;
  if (isLineRange) {
    const start = isLineRange[1];
    const end = isLineRange[2];
    tooltipContent = end
      ? t`Lines ${start}-${end}`
      : t`Line ${start}`;
  }

  // Extract hostname from source URL
  let hostname = sourceUrl;
  if (sourceUrl) {
    try {
      hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch (e) {
      // Keep full URL if parsing fails
    }
  }

  const handleClick = async () => {
    if (sourceUrl) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      openUrl(sourceUrl).catch(err => console.error("Failed to open source:", err));
    }
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            onClick={sourceUrl ? handleClick : undefined}
            className={cn(
              "inline-flex items-center justify-center",
              "mx-0.5 align-baseline",
              "text-xs font-medium text-primary",
              "select-none",
              sourceUrl ? "cursor-pointer hover:text-primary/80" : "cursor-help",
              "transition-colors",
              className,
            )}
          >
            [{number}]
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            className={cn(
              "bg-popover text-popover-foreground rounded-md px-3 py-1.5",
              "text-sm shadow-md border border-border",
              "animate-in fade-in-0 zoom-in-95",
              "z-50 max-w-xs",
            )}
          >
            <div className="flex flex-col gap-1">
              {hostname && sourceUrl
                ? (
                  <>
                    <div className="text-xs font-medium break-all">
                      {hostname}
                    </div>
                    <div className="text-xs text-muted-foreground">{tooltipContent}</div>
                    <div className="text-xs text-primary/70 mt-0.5">
                      {t`Click to open →`}
                    </div>
                  </>
                )
                : <div className="text-xs text-muted-foreground">{tooltipContent}</div>}
            </div>
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
