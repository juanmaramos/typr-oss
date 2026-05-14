import "../styles/tiptap.css";
import "../styles/mention.css";

import { type Editor as TiptapEditor, EditorContent, type HTMLContent, useEditor } from "@tiptap/react";
import { forwardRef, useEffect, useRef } from "react";

import * as shared from "../shared";
import { mention, type MentionConfig } from "./mention";

export type { TiptapEditor };
export type TiptapEditorHandle = {
  editor: TiptapEditor | null;
  setSuppressChangeHandling: (suppress: boolean) => void;
};

interface EditorProps {
  handleChange: (content: HTMLContent) => void;
  initialContent: HTMLContent;
  editable?: boolean;
  setContentFromOutside?: boolean;
  suppressExternalContentSync?: boolean;
  aiWriting?: boolean;
  mentionConfig: MentionConfig;
  placeholderText?: string;
}

const BOTTOM_FOLLOW_THRESHOLD_PX = 96;

function getScrollContainer(editor: TiptapEditor): HTMLElement | null {
  return editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null;
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_FOLLOW_THRESHOLD_PX;
}

function restoreScrollAfterContentChange(editor: TiptapEditor, shouldFollowBottom: boolean, previousScrollTop: number) {
  const scrollContainer = getScrollContainer(editor);
  if (!scrollContainer) {
    return;
  }

  requestAnimationFrame(() => {
    if (shouldFollowBottom) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } else {
      scrollContainer.scrollTop = previousScrollTop;
    }
  });
}

const Editor = forwardRef<TiptapEditorHandle, EditorProps>(
  (
    {
      handleChange,
      initialContent,
      editable = true,
      setContentFromOutside = false,
      suppressExternalContentSync = false,
      aiWriting = false,
      mentionConfig,
      placeholderText,
    },
    ref,
  ) => {
    const previousContentRef = useRef<HTMLContent>(initialContent);
    const aiWritingRef = useRef(aiWriting);
    const suppressChangeHandlingRef = useRef(false);

    const onUpdate = ({ editor }: { editor: TiptapEditor }) => {
      if (!editor.isInitialized) {
        return;
      }

      if (aiWritingRef.current || suppressChangeHandlingRef.current) {
        return;
      }

      handleChange(editor.getHTML());
    };

    const editor = useEditor({
      extensions: [
        ...shared.getExtensions(placeholderText),
        mention(mentionConfig),
      ],
      editable,
      content: initialContent || "<p></p>",
      onCreate: ({ editor }) => {
        editor.view.dom.setAttribute("spellcheck", "false");
        editor.view.dom.setAttribute("autocomplete", "off");
        editor.view.dom.setAttribute("autocapitalize", "off");

        // Clean stale diff marks from persisted content (from previous sessions)
        // This handles the case where user closes app with pending diff marks
        const currentHTML = editor.getHTML();
        if (currentHTML.includes("data-diff-type")) {
          console.log("[Editor] Cleaning stale diff marks from persisted content");
          const diffMarkType = editor.schema.marks.diffMark;
          if (diffMarkType) {
            // Remove deleted nodes and all diff marks
            const tr = editor.state.tr;
            const rangesToDelete: { from: number; to: number }[] = [];

            editor.state.doc.descendants((node, pos) => {
              if (
                node.isText
                && node.marks.some(m => m.type === diffMarkType && (m.attrs.type === -1 || m.attrs.type === "-1"))
              ) {
                rangesToDelete.push({ from: pos, to: pos + node.nodeSize });
              }
            });

            let cleanTr = tr;
            for (let i = rangesToDelete.length - 1; i >= 0; i--) {
              cleanTr = cleanTr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
            }

            cleanTr = cleanTr.removeMark(0, cleanTr.doc.content.size, diffMarkType);
            editor.view.dispatch(cleanTr);
            console.log("[Editor] Stale diff marks cleaned - auto-accepted on load");
          }
        }
      },
      onUpdate,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: "tiptap-normal",
        },
        scrollThreshold: 32,
        scrollMargin: 32,
      },
    });

    useEffect(() => {
      if (ref && typeof ref === "object") {
        ref.current = {
          editor,
          setSuppressChangeHandling: (suppress: boolean) => {
            suppressChangeHandlingRef.current = suppress;
          },
        };
      }
    }, [editor]);

    useEffect(() => {
      aiWritingRef.current = aiWriting;
    }, [aiWriting]);

    useEffect(() => {
      if (!editor) {
        return;
      }

      if (aiWriting) {
        editor.view.dom.setAttribute("data-ai-writing", "true");
      } else {
        editor.view.dom.removeAttribute("data-ai-writing");
      }
    }, [editor, aiWriting]);

    useEffect(() => {
      if (suppressExternalContentSync) {
        return;
      }

      if (editor && (setContentFromOutside || previousContentRef.current !== initialContent)) {
        previousContentRef.current = initialContent;

        const scrollContainer = getScrollContainer(editor);
        const shouldFollowBottom = scrollContainer ? isNearBottom(scrollContainer) : false;
        const previousScrollTop = scrollContainer?.scrollTop ?? 0;

        if (setContentFromOutside) {
          const { from, to } = editor.state.selection;
          editor.commands.setContent(initialContent);
          editor.commands.markNewContent();

          if (from > 0 && to > 0 && from < editor.state.doc.content.size) {
            editor.commands.setTextSelection({ from, to });
          }

          restoreScrollAfterContentChange(editor, shouldFollowBottom, previousScrollTop);
        } else if (!editor.isFocused) {
          editor.commands.setContent(initialContent);
          restoreScrollAfterContentChange(editor, shouldFollowBottom, previousScrollTop);
        }
      }
    }, [editor, initialContent, setContentFromOutside, suppressExternalContentSync]);

    useEffect(() => {
      if (editor) {
        editor.setEditable(editable);
      }
    }, [editor, editable]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Backspace" && editor?.state.selection.empty) {
          const isAtStart = editor.state.selection.$head.pos === 0;
          if (isAtStart) {
            e.preventDefault();
          }
        }

        if (e.key === "Tab") {
          e.preventDefault();
        }
      };

      if (editor) {
        editor.view.dom.addEventListener("keydown", handleKeyDown);
      }

      return () => {
        if (editor) {
          editor.view.dom.removeEventListener("keydown", handleKeyDown);
        }
      };
    }, [editor]);

    return (
      <div role="textbox">
        <EditorContent editor={editor} />
      </div>
    );
  },
);

Editor.displayName = "Editor";

export default Editor;
