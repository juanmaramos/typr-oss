import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ShortcutById } from "@/components/shortcut-by-id";
import { useTypr } from "@/contexts";
import { useChatState } from "@/stores/useChatState";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { getSelectedText } from "@/utils/selection-replacement";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import type { TiptapEditor } from "@typr/tiptap/editor";
import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";

interface SelectionActionsProps {
  editor: TiptapEditor | null;
  sessionId: string;
  className?: string;
  onImproveWriting?: (selectedText: string, range: { from: number; to: number }) => void;
}

export function SelectionActions({
  editor,
  sessionId,
  className,
  onImproveWriting,
}: SelectionActionsProps) {
  const { t } = useLingui();
  const [showActions, setShowActions] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const { setSelection } = useSelectionContext();
  const { userId } = useTypr();

  // Get current edit mode from store
  const { getEditMode } = useChatState();
  const editMode = getEditMode(sessionId);

  const handleEditInChat = useCallback(() => {
    if (!editor) {
      return;
    }

    const selection = getSelectedText(editor);
    if (selection) {
      // Track analytics for edit in chat feature
      if (userId) {
        analyticsCommands.event({
          event: "edit_in_chat_initiated",
          distinct_id: userId,
          properties: {
            text_length: selection.text.length,
            session_id: sessionId,
            triggered_by: "keyboard_shortcut", // or "button_click"
          },
        });
      }

      setSelection(selection.text, selection.range, sessionId);
      setShowActions(false);

      // Apply AI selection highlight (persistent decoration) before focus shifts
      editor.commands.setAISelection(selection.range);
      console.log("🎯 Applied AI selection highlight:", selection.range);

      // Dispatch event to focus chat input and prepare for editing
      window.dispatchEvent(
        new CustomEvent("editInChatRequested", {
          detail: {
            selectedText: selection.text,
            range: selection.range,
            sessionId,
            action: "editInChat",
          },
        }),
      );

      console.log("🎯 Edit in chat requested (⌘L) for:", selection.text.slice(0, 50) + "...");
      console.log("🎯 Selection context set:", { text: selection.text.length, range: selection.range, sessionId });
    }
  }, [editor, sessionId, setSelection, userId]);

  const handleImproveWriting = useCallback(() => {
    if (!editor) {
      return;
    }

    const selection = getSelectedText(editor);
    if (selection) {
      // Track analytics for improve writing feature
      if (userId) {
        analyticsCommands.event({
          event: "improve_writing_initiated",
          distinct_id: userId,
          properties: {
            text_length: selection.text.length,
            session_id: sessionId,
            triggered_by: "keyboard_shortcut",
          },
        });
      }

      setSelection(selection.text, selection.range, sessionId);
      setShowActions(false);

      // Trigger improve writing action via callback if provided
      if (onImproveWriting) {
        onImproveWriting(selection.text, selection.range);
      } else {
        // Fallback: dispatch event for improve writing
        window.dispatchEvent(
          new CustomEvent("improveWritingRequested", {
            detail: {
              selectedText: selection.text,
              range: selection.range,
              sessionId,
              action: "improveWriting",
            },
          }),
        );
      }

      console.log("Improve writing requested for:", selection.text);
    }
  }, [editor, sessionId, setSelection, onImproveWriting, userId]);

  // Cmd+Shift+I keyboard shortcut for improve writing (only in Edit mode)
  useHotkeys(
    "mod+shift+i",
    (event) => {
      // Only trigger in Edit mode
      if (editMode === "edit") {
        event.preventDefault();
        handleImproveWriting();
      }
    },
    {
      enableOnFormTags: false,
      enableOnContentEditable: true,
    },
    [handleImproveWriting, editMode],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    // Define updateSelection directly inside effect to avoid stale closures
    const updateSelection = () => {
      const selection = getSelectedText(editor);

      if (selection && selection.text.length > 0) {
        // Position the toolbar above the selection (Cursor-style)
        const { view } = editor;
        const { from } = editor.state.selection;
        const coords = view.coordsAtPos(from);

        setPosition({
          top: coords.top - 8, // Position above selection
          left: coords.left,
        });

        setShowActions(true);
      } else {
        setShowActions(false);
      }
    };

    // Listen to selection changes
    const handleSelectionUpdate = () => {
      // Match TipTap's default BubbleMenu delay for stability
      setTimeout(updateSelection, 250);
    };

    editor.on("selectionUpdate", handleSelectionUpdate);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, handleEditInChat]);

  // Mod+L keyboard shortcut for Add to Chat (works on both Mac and Windows)
  useHotkeys(
    "mod+l",
    (event) => {
      event.preventDefault();
      handleEditInChat();
    },
    {
      enableOnFormTags: false,
      enableOnContentEditable: true,
    },
    [handleEditInChat],
  );

  if (!showActions) {
    return null;
  }

  // Mode-aware rendering: Show different actions based on chat mode
  // Ask mode: Only show "Add to Chat" - for asking questions about the selection
  // Edit mode: Show both "Improve writing" and "Edit in Chat" - for making changes
  const isAskMode = editMode === "chat";

  return (
    <div
      className={cn(
        "fixed z-50 flex gap-1 p-1",
        // Elevated frosted glass with strong shadow for visibility
        "bg-background/95 backdrop-blur-xl",
        "border border-foreground/[0.08]",
        "rounded-lg",
        // Enhanced shadow for better separation from content
        "shadow-[0_4px_12px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.04)]",
        "dark:shadow-[0_4px_12px_rgba(0,0,0,0.24),0_2px_4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.06)]",
        // Smooth animation
        "animate-in fade-in-0 duration-75",
        className,
      )}
      style={{
        top: position.top,
        left: position.left,
        transform: "translateY(-100%)", // Position above cursor
      }}
    >
      {/* In Edit mode, show Improve Writing button */}
      {!isAskMode && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleImproveWriting}
          className="h-7 px-2 text-xs gap-1.5"
        >
          <i className="ri-pencil-ai-fill text-sm" />
          {t`Improve writing`}
          <ShortcutById shortcutId="improve-writing" variant="ghost" className="ml-1" />
        </Button>
      )}

      {/* Always show this button, but with different label based on mode */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleEditInChat}
        className="h-7 px-2 text-xs gap-1.5"
      >
        <i className="ri-chat-ai-line text-sm" />
        {isAskMode ? t`Add to Chat` : t`Edit in Chat`}
        <ShortcutById shortcutId="add-text-to-chat" variant="ghost" className="ml-1" />
      </Button>
    </div>
  );
}
