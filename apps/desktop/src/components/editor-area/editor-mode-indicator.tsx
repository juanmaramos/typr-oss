import { cn } from "@/lib/utils";
import { useSession } from "@typr/utils/contexts";
import { Trans } from "@lingui/react/macro";

interface EditorModeIndicatorProps {
  sessionId: string;
  className?: string;
}

/**
 * View switcher tabs - only shown when there's AI-enhanced content
 *
 * Design Philosophy:
 * - PROGRESSIVE DISCLOSURE: Only appears when there's something to switch between
 * - CONSISTENCY: Matches Chat/Transcript pattern and floating dock logic
 * - DEFERENCE: Hidden by default, shown only when needed
 *
 * Visibility Logic:
 * - New notes: Hidden (nothing to switch to, defaults to raw notes)
 * - After AI enhancement: Shown (can now toggle between notes and AI summary)
 * - Matches floating dock behavior (appears when enhanced content exists)
 */
export function EditorModeIndicator({ sessionId, className }: EditorModeIndicatorProps) {
  const [showRaw, setShowRaw, enhancedContent] = useSession(sessionId, (s) => [
    s.showRaw,
    s.setShowRaw,
    s.session?.enhanced_memo_html ?? "",
  ]);

  // Progressive disclosure: Only show when there's enhanced content to switch to
  if (!enhancedContent) {
    return null;
  }

  return (
    <div className={cn("flex justify-start mb-4 px-8", className)}>
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 border border-border/40">
        {/* Notes Tab - First to match dock pattern */}
        <button
          onClick={() => setShowRaw(true)}
          className={cn(
            "flex items-center justify-center px-3 py-1 rounded-md",
            "text-xs font-medium transition-all duration-200",
            showRaw
              ? "bg-background text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <Trans>Notes</Trans>
        </button>

        {/* AI Summary Tab - Second */}
        <button
          onClick={() => setShowRaw(false)}
          className={cn(
            "flex items-center justify-center px-3 py-1 rounded-md",
            "text-xs font-medium transition-all duration-200",
            !showRaw
              ? "bg-background text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <Trans>AI Summary</Trans>
        </button>
      </div>
    </div>
  );
}
