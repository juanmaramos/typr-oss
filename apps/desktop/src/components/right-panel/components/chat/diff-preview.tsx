import { useLingui } from "@lingui/react/macro";
import { diffWords } from "diff";
import { memo, useEffect, useState } from "react";

import { ShortcutById } from "@/components/shortcut-by-id";
import { useTypr } from "@/contexts";
import { useDiffActions } from "@/contexts/diff-actions";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { replaceSelectedText } from "@/utils/selection-replacement";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { Button } from "@typr/ui/components/ui/button";

interface DiffPreviewProps {
  original: string; // Can be HTML or plain text
  edited: string; // Can be HTML or plain text
  reasoning: string;
  range: { from: number; to: number };
  sessionId: string;
}

/**
 * Convert HTML to plain text for diff display
 */
const htmlToText = (html: string): string => {
  // Simple HTML to text conversion for diff preview
  // Remove HTML tags but preserve structure
  return html
    .replace(/<\/p>/gi, "\n\n") // Paragraph breaks
    .replace(/<br\s*\/?>/gi, "\n") // Line breaks
    .replace(/<\/h[1-6]>/gi, "\n\n") // Heading breaks
    .replace(/<\/li>/gi, "\n") // List item breaks
    .replace(/<[^>]+>/g, "") // Remove all other tags
    .replace(/&nbsp;/g, " ") // Convert entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .trim();
};

export const DiffPreview = memo(({
  original,
  edited,
  reasoning,
  range,
  sessionId,
}: DiffPreviewProps) => {
  const { t } = useLingui();
  const { clearSelection } = useSelectionContext();
  const [actionState, setActionState] = useState<"pending" | "accepted" | "rejected">("pending");
  const { userId } = useTypr();
  const { registerHandlers, unregisterHandlers } = useDiffActions();

  const handleAccept = () => {
    if (!sessionId) {
      console.error("No session ID available for text replacement");
      return;
    }

    const editorRef = window.__TYPR_EDITORS__?.[sessionId];
    const editor = editorRef?.editor;

    if (editor && range) {
      // Handle full document replacement (Saru-style) vs surgical editing
      let success = false;

      if (range.to === -1) {
        // Full document replacement - use setContent for HTML (TipTap best practice)
        console.log("🎯 [DiffPreview] Full document HTML replacement");
        try {
          // The edited content is HTML from the AI - use setContent
          editor.commands.setContent(edited);
          success = true;
        } catch (error) {
          console.error("Failed to replace full document:", error);
        }
      } else {
        // Surgical replacement - replace specific range
        console.log("🎯 [DiffPreview] Surgical text replacement");
        success = replaceSelectedText(editor, range, edited);
      }

      if (success) {
        // Track analytics for accepting changes
        if (userId) {
          analyticsCommands.event({
            event: "text_edit_accepted",
            distinct_id: userId,
            properties: {
              original_length: original.length,
              edited_length: edited.length,
              session_id: sessionId,
              change_type: "agent_writing",
            },
          });
        }

        clearSelection(); // Clear after successful edit
        setActionState("accepted");
        console.log("✅ Text improvement applied successfully");
      } else {
        console.error("❌ Failed to apply text changes");
      }
    } else {
      console.error("❌ Editor or range not available for text replacement");
    }
  };

  const handleReject = () => {
    // Track analytics for rejecting changes
    if (userId) {
      analyticsCommands.event({
        event: "text_edit_rejected",
        distinct_id: userId,
        properties: {
          original_length: original.length,
          edited_length: edited.length,
          session_id: sessionId,
          change_type: "agent_writing",
        },
      });
    }

    setActionState("rejected");
    console.log("❌ Text improvement rejected");
  };

  // Register keyboard shortcuts when in pending state
  useEffect(() => {
    if (actionState === "pending") {
      registerHandlers({ onAccept: handleAccept, onReject: handleReject });
      return () => unregisterHandlers();
    }
  }, [actionState, registerHandlers, unregisterHandlers]);

  // Detect if content is HTML (contains tags)
  const isHTML = original.includes("<") && edited.includes("<");

  // Convert HTML to text for readable diff preview
  const originalText = isHTML ? htmlToText(original) : original;
  const editedText = isHTML ? htmlToText(edited) : edited;

  const diff = diffWords(originalText, editedText);

  // Smart truncation: Only show changed content + minimal context
  const CONTEXT_LENGTH = 100; // Characters of unchanged context to show

  const unchangedLength = diff.reduce((acc, part) => !part.added && !part.removed ? acc + part.value.length : acc, 0);

  const needsTruncation = unchangedLength > CONTEXT_LENGTH * 2;

  // Build smart diff with truncation
  let truncatedDiff: Array<{ value: string; added?: boolean; removed?: boolean }> = [];
  let unchangedBufferText = "";
  let totalUnchangedShown = 0;

  for (const part of diff) {
    if (part.added || part.removed) {
      // Show all changes
      // If we have buffered unchanged text, show some context
      if (unchangedBufferText.length > 0 && needsTruncation) {
        const contextBefore = unchangedBufferText.slice(-CONTEXT_LENGTH);
        if (contextBefore.length < unchangedBufferText.length) {
          truncatedDiff.push({ value: "...\n", added: false, removed: false });
        }
        truncatedDiff.push({ value: contextBefore, added: false, removed: false });
        unchangedBufferText = "";
      } else if (unchangedBufferText.length > 0) {
        truncatedDiff.push({ value: unchangedBufferText, added: false, removed: false });
        unchangedBufferText = "";
      }
      truncatedDiff.push(part);
    } else {
      // Buffer unchanged text
      unchangedBufferText += part.value;
      totalUnchangedShown += part.value.length;

      // If we've shown enough unchanged context after changes, truncate
      if (unchangedBufferText.length > 0 && totalUnchangedShown > CONTEXT_LENGTH && needsTruncation) {
        const contextAfter = unchangedBufferText.slice(0, CONTEXT_LENGTH);
        truncatedDiff.push({ value: contextAfter, added: false, removed: false });
        truncatedDiff.push({ value: "\n...", added: false, removed: false });
        unchangedBufferText = "";
        break; // Stop processing rest
      }
    }
  }

  // Add any remaining buffer (if we're not truncating)
  if (unchangedBufferText.length > 0 && !needsTruncation) {
    truncatedDiff.push({ value: unchangedBufferText, added: false, removed: false });
  }

  const displayDiff = needsTruncation ? truncatedDiff : diff;

  return (
    <div className="mt-3 border border-border bg-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <i className="ri-quill-pen-ai-line text-base text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Suggested change</span>
        </div>
        {reasoning && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {reasoning.replace(/^Surgical edit:\s*/i, "")}
          </p>
        )}
      </div>

      {/* Diff Content - Word Level Changes */}
      <div className="px-4 py-3 bg-background font-mono text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
        {displayDiff.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="bg-success/10 text-success px-1.5 py-0.5 rounded-sm font-medium border border-success/30"
                title={t`Added text`}
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="bg-destructive/10 text-destructive line-through px-1.5 py-0.5 rounded-sm font-medium opacity-90 border border-destructive/30"
                title={t`Removed text`}
              >
                {part.value}
              </span>
            );
          }
          return (
            <span key={index} className="text-foreground">
              {part.value}
            </span>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
        {actionState === "pending"
          ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={handleAccept}
                className="h-7 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground flex items-center"
              >
                <i className="ri-check-line text-sm" />
                <span>Accept</span>
                <ShortcutById shortcutId="accept-changes" variant="ghost" className="text-xs opacity-70" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReject}
                className="h-7 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground flex items-center"
              >
                <i className="ri-close-line text-sm" />
                <span>Reject</span>
                <ShortcutById shortcutId="reject-changes" variant="ghost" className="text-xs opacity-70" />
              </Button>
            </>
          )
          : actionState === "accepted"
          ? (
            <div className="flex items-center gap-2 text-xs text-primary">
              <i className="ri-check-line text-sm" />
              <span className="font-medium">Changes accepted</span>
            </div>
          )
          : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <i className="ri-close-line text-sm" />
              <span className="font-medium">Changes rejected</span>
            </div>
          )}
      </div>
    </div>
  );
});

DiffPreview.displayName = "DiffPreview";
