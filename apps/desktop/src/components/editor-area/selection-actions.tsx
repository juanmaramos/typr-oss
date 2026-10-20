import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "react-hotkeys-hook";
import type { Instance } from "tippy.js";

import { ShortcutById } from "@/components/shortcut-by-id";
import { useTypr } from "@/contexts";
import { useChatState } from "@/stores/useChatState";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { getSelectedText } from "@/utils/selection-replacement";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { BubbleMenu, type TiptapEditor, useEditorState } from "@typr/tiptap/editor";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { cn } from "@typr/ui/lib/utils";

interface SelectionActionsProps {
  editor: TiptapEditor | null;
  sessionId: string;
  className?: string;
  isAgentWritingEnabled: boolean;
  onImproveWriting?: (selectedText: string, range: { from: number; to: number }) => void;
}

export function SelectionActions({
  editor,
  sessionId,
  className,
  isAgentWritingEnabled,
  onImproveWriting,
}: SelectionActionsProps) {
  const { t } = useLingui();
  const menu = useRef<Instance | null>(null);
  const submenuOpen = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [blockStyleOpen, setBlockStyleOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const linkInputId = useId();
  const linkApplied = useRef(false);
  const formatting = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      link: editor?.isActive("link") ?? false,
      blockStyle: editor?.isActive("bulletList")
        ? "bulletList"
        : editor?.isActive("orderedList")
        ? "orderedList"
        : editor?.isActive("heading", { level: 2 })
        ? "heading2"
        : editor?.isActive("heading", { level: 3 })
        ? "heading3"
        : "paragraph",
    }),
  });
  const { setSelection } = useSelectionContext();
  const { userId } = useTypr();

  // Get current edit mode from store
  const editMode = useChatState((state) => state.sessions[sessionId]?.editMode ?? "chat");

  const handleEditInChat = useCallback(() => {
    if (!editor?.isEditable || !isAgentWritingEnabled) {
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
      menu.current?.hide();

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
  }, [editor, sessionId, setSelection, userId, isAgentWritingEnabled]);

  const handleImproveWriting = useCallback(() => {
    if (!editor?.isEditable || !isAgentWritingEnabled) {
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
      menu.current?.hide();

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
  }, [editor, sessionId, setSelection, onImproveWriting, userId, isAgentWritingEnabled]);

  // Cmd+Shift+I keyboard shortcut for improve writing (only in Edit mode)
  useHotkeys(
    "mod+shift+i",
    (event) => {
      // Only trigger in Edit mode
      if (editMode === "edit" && editor?.isEditable && editor.isFocused && getSelectedText(editor)) {
        event.preventDefault();
        handleImproveWriting();
      }
    },
    {
      enabled: isAgentWritingEnabled,
      enableOnFormTags: false,
      enableOnContentEditable: true,
    },
    [handleImproveWriting, editMode],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    // Alt+F10 is the conventional editor shortcut for focusing formatting controls.
    const focusToolbar = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "F10" && menu.current?.state.isVisible) {
        event.preventDefault();
        menu.current.popper.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    editor.view.dom.addEventListener("keydown", focusToolbar);
    const closeSubmenus = () => {
      submenuOpen.current = false;
      setLinkOpen(false);
      setBlockStyleOpen(false);
      if (!getSelectedText(editor)) {
        menu.current?.hide();
      }
    };
    const checkEditable = () => {
      if (!editor.isEditable) {
        closeSubmenus();
        menu.current?.hide();
      }
    };
    editor.on("selectionUpdate", closeSubmenus);
    editor.on("update", checkEditable);
    return () => {
      editor.view.dom.removeEventListener("keydown", focusToolbar);
      editor.off("selectionUpdate", closeSubmenus);
      editor.off("update", checkEditable);
    };
  }, [editor]);

  // Mod+L keyboard shortcut for Add to Chat (works on both Mac and Windows)
  useHotkeys(
    "mod+l",
    (event) => {
      if (editor?.isEditable && editor.isFocused && getSelectedText(editor)) {
        event.preventDefault();
        handleEditInChat();
      }
    },
    {
      enabled: isAgentWritingEnabled,
      enableOnFormTags: false,
      enableOnContentEditable: true,
    },
    [handleEditInChat],
  );

  if (!editor) {
    return null;
  }

  const isAskMode = editMode === "chat";
  const changeBlockStyle = (style: string) => {
    if (!editor.isEditable) {
      return;
    }
    const chain = editor.chain().focus();
    if (style === "bulletList") {
      if (!editor.isActive("bulletList")) {
        chain.toggleBulletList();
      }
    } else if (style === "orderedList") {
      if (!editor.isActive("orderedList")) {
        chain.toggleOrderedList();
      }
    } else {
      if (editor.isActive("bulletList")) {
        chain.toggleBulletList();
      }
      if (editor.isActive("orderedList")) {
        chain.toggleOrderedList();
      }
      if (style === "paragraph") {
        chain.setParagraph();
      } else {
        chain.setHeading({ level: style === "heading2" ? 2 : 3 });
      }
    }
    chain.run();
  };

  // Tippy moves the menu to body; a React portal keeps delegated control events working there.
  return createPortal(
    <div className="contents">
      <BubbleMenu
        editor={editor}
        pluginKey="selectionActions"
        updateDelay={200}
        shouldShow={({ editor, view, state, element, from, to }) =>
          editor.isEditable && !state.selection.empty && !!state.doc.textBetween(from, to).trim()
          && (view.hasFocus() || element.contains(document.activeElement) || submenuOpen.current)}
        tippyOptions={{
          appendTo: () => document.body,
          maxWidth: "none",
          placement: "top",
          arrow: false,
          role: "presentation",
          offset: [0, 8],
          popperOptions: {
            modifiers: [
              { name: "flip", options: { padding: 12 } },
              { name: "preventOverflow", options: { padding: 12 } },
              // The virtual selection rectangle belongs to the editor's scroll container.
              { name: "eventListeners", options: { scroll: true, resize: true } },
            ],
          },
          onCreate: (instance) => {
            menu.current = instance;
          },
          onDestroy: () => {
            menu.current = null;
          },
          // Radix popovers use portals, outside BubbleMenu's DOM subtree.
          onHide: () => {
            if (submenuOpen.current && editor.isEditable && !editor.state.selection.empty) {
              return false;
            }
          },
        }}
      >
        <div
          role="group"
          aria-label={t`Text formatting`}
          className={cn(
            "flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-1 rounded-surface border border-border bg-popover p-1 text-popover-foreground shadow-md",
            className,
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              editor.commands.focus();
              menu.current?.hide();
            }
          }}
        >
          <Button
            type="button"
            size="icon"
            variant={formatting?.bold ? "secondary" : "ghost"}
            className="size-7"
            aria-label={t`Bold`}
            title={t`Bold`}
            aria-pressed={formatting?.bold}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (editor.isEditable) {
                editor.chain().focus().toggleBold().run();
              }
            }}
          >
            <i className="ri-bold text-base" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={formatting?.italic ? "secondary" : "ghost"}
            className="size-7"
            aria-label={t`Italic`}
            title={t`Italic`}
            aria-pressed={formatting?.italic}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (editor.isEditable) {
                editor.chain().focus().toggleItalic().run();
              }
            }}
          >
            <i className="ri-italic text-base" aria-hidden="true" />
          </Button>
          <Popover
            open={linkOpen}
            onOpenChange={(open) => {
              submenuOpen.current = open;
              setLinkOpen(open);
              if (open) {
                setLinkUrl(editor.getAttributes("link").href ?? "");
                setLinkError(false);
                linkApplied.current = false;
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={formatting?.link ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                aria-label={formatting?.link ? t`Edit link` : t`Link`}
                title={formatting?.link ? t`Edit link` : t`Link`}
                onMouseDown={(event) => event.preventDefault()}
              >
                <i className="ri-link text-base" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="max-w-[calc(100vw-1.5rem)] p-3"
              onCloseAutoFocus={(event) => {
                if (linkApplied.current || !editor.isEditable) {
                  event.preventDefault();
                }
              }}
            >
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!editor.isEditable) {
                    return;
                  }
                  try {
                    const value = linkUrl.trim();
                    const href = new URL(value.includes(":") ? value : `https://${value}`).href;
                    // Validate through the existing Link extension's URI policy before changing content.
                    if (!editor.can().setLink({ href })) {
                      setLinkError(true);
                      return;
                    }
                    linkApplied.current = true;
                    submenuOpen.current = false;
                    setLinkOpen(false);
                    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
                  } catch {
                    setLinkError(true);
                  }
                }}
              >
                <label htmlFor={linkInputId} className="text-xs font-medium">
                  <Trans>Link URL</Trans>
                </label>
                <Input
                  id={linkInputId}
                  value={linkUrl}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    setLinkError(false);
                  }}
                  placeholder="https://example.com"
                  inputMode="url"
                  autoComplete="url"
                  className="h-8 text-sm"
                  aria-invalid={linkError}
                  aria-describedby={linkError ? `${linkInputId}-error` : undefined}
                />
                {linkError && (
                  <p id={`${linkInputId}-error`} role="alert" className="text-xs text-destructive">
                    <Trans>Enter a valid HTTP or HTTPS URL.</Trans>
                  </p>
                )}
                <div className="flex justify-end gap-1">
                  {formatting?.link && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!editor.isEditable) {
                          return;
                        }
                        linkApplied.current = true;
                        submenuOpen.current = false;
                        setLinkOpen(false);
                        editor.chain().focus().extendMarkRange("link").unsetLink().run();
                      }}
                    >
                      <Trans>Remove link</Trans>
                    </Button>
                  )}
                  <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                    <Trans>Apply link</Trans>
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
          <Select
            open={blockStyleOpen}
            value={formatting?.blockStyle ?? "paragraph"}
            onValueChange={changeBlockStyle}
            onOpenChange={(open) => {
              submenuOpen.current = open;
              setBlockStyleOpen(open);
            }}
          >
            <SelectTrigger
              size="sm"
              variant="ghost"
              className="h-7 w-auto gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t`Block style`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (editor.isEditable) {
                  editor.commands.focus();
                }
              }}
            >
              <SelectItem value="paragraph">
                <Trans>Paragraph</Trans>
              </SelectItem>
              <SelectItem value="heading2">
                <Trans>Heading 2</Trans>
              </SelectItem>
              <SelectItem value="heading3">
                <Trans>Heading 3</Trans>
              </SelectItem>
              <SelectItem value="bulletList">
                <Trans>Bulleted list</Trans>
              </SelectItem>
              <SelectItem value="orderedList">
                <Trans>Numbered list</Trans>
              </SelectItem>
            </SelectContent>
          </Select>
          {isAgentWritingEnabled && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              {!isAskMode && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleImproveWriting}
                  className="h-7 gap-1.5 px-2 text-xs"
                >
                  <i className="ri-pencil-ai-fill text-sm" aria-hidden="true" />
                  {t`Improve writing`}
                  <ShortcutById shortcutId="improve-writing" variant="ghost" className="ml-1" />
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleEditInChat}
                className="h-7 gap-1.5 px-2 text-xs"
              >
                <i className="ri-chat-ai-line text-sm" aria-hidden="true" />
                {isAskMode ? t`Add to Chat` : t`Edit in Chat`}
                <ShortcutById shortcutId="add-text-to-chat" variant="ghost" className="ml-1" />
              </Button>
            </>
          )}
        </div>
      </BubbleMenu>
    </div>,
    document.body,
  );
}
