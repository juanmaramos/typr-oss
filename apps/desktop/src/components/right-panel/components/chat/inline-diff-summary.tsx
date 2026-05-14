/**
 * Inline Diff Summary Component
 * Shows compact summary in chat when changes are displayed inline in editor
 * Cursor-style: brief description + Accept/Reject buttons
 */

import { ShortcutById } from "@/components/shortcut-by-id";
import { useDiffActions } from "@/contexts/diff-actions";
import { Button } from "@typr/ui/components/ui/button";
import { useLingui } from "@lingui/react/macro";
import { memo, useEffect, useState } from "react";

interface InlineDiffSummaryProps {
  changeType: "addition" | "modification" | "removal";
  characterCount: number;
  preview: string; // First ~100 chars of change
  reasoning: string; // User's request
  initialStatus?: "pending" | "accepted" | "rejected"; // Persisted status
  onAccept: () => void;
  onReject: () => void;
}

export const InlineDiffSummary = memo(({
  changeType,
  characterCount,
  preview,
  reasoning,
  initialStatus = "pending",
  onAccept,
  onReject,
}: InlineDiffSummaryProps) => {
  const { t } = useLingui();
  const [actionState, setActionState] = useState<"pending" | "accepted" | "rejected">(initialStatus);
  const { registerHandlers, unregisterHandlers } = useDiffActions();

  // Sync button state with prop changes (e.g., when auto-accepted by subsequent edits)
  useEffect(() => {
    setActionState(initialStatus);
  }, [initialStatus]);

  const handleAccept = () => {
    onAccept();
    setActionState("accepted");
  };

  const handleReject = () => {
    onReject();
    setActionState("rejected");
  };

  // Register keyboard shortcuts when in pending state
  useEffect(() => {
    if (actionState === "pending") {
      registerHandlers({ onAccept: handleAccept, onReject: handleReject });
      return () => unregisterHandlers();
    }
  }, [actionState, registerHandlers, unregisterHandlers]);

  // Translatable labels for change types
  const changeLabel = {
    addition: t`Added`,
    modification: t`Edited`,
    removal: t`Removed`,
  }[changeType];

  return (
    <div className="mt-3 bg-background border border-border/50 rounded-lg overflow-hidden shadow-sm">
      {/* Header - Elegant with good hierarchy */}
      <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <i className="ri-pencil-ai-fill text-sm text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground">
              {changeLabel} {t`content`}
            </span>
            {reasoning && (
              <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
                {reasoning}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Preview - Clean box with good contrast */}
      <div className="px-4 py-3 bg-background">
        <div className="bg-muted/40 rounded-md p-2.5 border border-border/30">
          <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2">
            {preview}...
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-foreground/45">
          <i className="ri-lightbulb-ai-fill text-xs" />
          <span>Changes highlighted in editor</span>
        </div>
      </div>

      {/* Actions - Clear hierarchy */}
      <div className="px-4 py-3 border-t border-border/30 bg-muted/5 flex items-center gap-2">
        {actionState === "pending"
          ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={handleAccept}
                className="h-8 px-4 text-xs font-medium flex items-center gap-2"
              >
                <span>{t`Accept`}</span>
                <ShortcutById shortcutId="accept-changes" variant="ghost" className="text-xs opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReject}
                className="h-8 px-3 text-xs font-medium flex items-center gap-2"
              >
                <span>{t`Reject`}</span>
                <ShortcutById shortcutId="reject-changes" variant="ghost" className="text-xs opacity-70" />
              </Button>
            </>
          )
          : actionState === "accepted"
          ? (
            <div className="flex items-center gap-2 text-xs text-success bg-success/10 px-3 py-1.5 rounded-lg">
              <i className="ri-check-line text-sm" />
              <span className="font-medium">{t`Accepted`}</span>
            </div>
          )
          : (
            <div className="flex items-center gap-2 text-xs text-foreground/60 bg-muted/50 px-3 py-1.5 rounded-lg">
              <i className="ri-close-line text-sm" />
              <span className="font-medium">{t`Rejected`}</span>
            </div>
          )}
      </div>
    </div>
  );
});

InlineDiffSummary.displayName = "InlineDiffSummary";
