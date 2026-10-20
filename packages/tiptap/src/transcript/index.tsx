import "../styles/transcript.css";

import { useLingui } from "@lingui/react";
import { SearchAndReplace } from "@sereneinserenade/tiptap-search-and-replace";
import { type Editor as TiptapEditor } from "@tiptap/core";
import BubbleMenu from "@tiptap/extension-bubble-menu";
import Document from "@tiptap/extension-document";
import History from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { forwardRef, useCallback, useEffect, useRef } from "react";

import { SpeakerSplit } from "./extensions";
import { SpeakerNode } from "./nodes";
import { TranscriptPreview, type TranscriptPreviews, transcriptPreviewsKey } from "./previews";
import { fromEditorToWords, fromWordsToEditor, getSpeakerLabel, type SpeakerAttributes, type Word } from "./utils";

export { SPEAKER_ID_ATTR, SPEAKER_INDEX_ATTR, SPEAKER_LABEL_ATTR } from "./utils";
export { getSpeakerLabel };

export function shouldEmitTranscriptUpdate({
  isFocused,
  isProgrammaticUpdate,
}: {
  isFocused: boolean;
  isProgrammaticUpdate: boolean;
}) {
  return isFocused && !isProgrammaticUpdate;
}

interface TranscriptEditorProps {
  editable?: boolean;
  initialWords: Word[] | null;
  previews?: TranscriptPreviews;
  onUpdate?: (words: Word[]) => void;
}

export interface TranscriptEditorRef {
  editor: TiptapEditor | null;
  getWords: () => Word[] | null;
  setWords: (words: Word[]) => void;
  scrollToBottom: () => void;
  appendWords: (newWords: Word[]) => void;
  toText: () => string;
}

function shouldFollowTranscriptTail(container: HTMLElement | null, editor: TiptapEditor) {
  if (!container || editor.isFocused) {
    return false;
  }
  const selection = window.getSelection();
  const hasTextSelection = !!selection && !selection.isCollapsed && (
    !!selection.anchorNode && container.contains(selection.anchorNode)
    || !!selection.focusNode && container.contains(selection.focusNode)
  );
  return !hasTextSelection && container.scrollHeight - container.scrollTop - container.clientHeight <= 64;
}

// SearchAndReplace commands are declared in shared/extensions.ts

const TranscriptEditor = forwardRef<TranscriptEditorRef, TranscriptEditorProps>(
  ({ editable = true, onUpdate, initialWords, previews }, ref) => {
    const { i18n } = useLingui();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isProgrammaticUpdate = useRef(false);
    const hasUserChanges = useRef(false);

    const extensions = [
      Document.configure({ content: "speaker+" }),
      History,
      Text,
      SpeakerNode,
      SpeakerSplit,
      TranscriptPreview,
      SearchAndReplace.configure({
        searchResultClass: "search-result",
        disableRegex: true,
      }),
      BubbleMenu,
    ];

    const editor = useEditor({
      extensions,
      editable,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      onUpdate: ({ editor }) => {
        if (
          onUpdate
          && shouldEmitTranscriptUpdate({
            isFocused: editor.isFocused,
            isProgrammaticUpdate: isProgrammaticUpdate.current,
          })
        ) {
          hasUserChanges.current = true;
          onUpdate(fromEditorToWords(editor.getJSON() as any));
        }
      },
      onBlur: ({ editor }) => {
        // Ensure save happens when user stops editing
        if (onUpdate && hasUserChanges.current && !isProgrammaticUpdate.current) {
          hasUserChanges.current = false;
          onUpdate(fromEditorToWords(editor.getJSON() as any));
        }
      },
      content: initialWords ? fromWordsToEditor(initialWords) : undefined,
      editorProps: {
        attributes: {
          class: "tiptap-transcript",
        },
        scrollThreshold: 0, // Disable automatic scrolling
        scrollMargin: 0,
      },
    });

    // Define setWords function outside useEffect to prevent React flushSync warnings
    const setWords = useCallback((words: Word[]) => {
      if (!editor) {
        return;
      }

      // Store current cursor position and scroll position before updating content
      const { from, to } = editor.state.selection;
      const wasEditorFocused = editor.isFocused;
      const scrollTop = scrollContainerRef.current?.scrollTop || 0;
      const followTail = !editor.isEditable && shouldFollowTranscriptTail(scrollContainerRef.current, editor);

      isProgrammaticUpdate.current = true;
      const content = fromWordsToEditor(words);
      editor.commands.setContent(content, false);
      isProgrammaticUpdate.current = false;

      if (followTail && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }

      // Only restore cursor position if we were actually editing
      if (wasEditorFocused && from > 0 && to > 0 && from < editor.state.doc.content.size) {
        // Restore cursor without auto-scroll
        editor.commands.setTextSelection({ from, to });

        // Manually restore scroll position to prevent jump
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollTop;
        }
      }
    }, [editor]);

    useEffect(() => {
      if (ref && typeof ref === "object" && editor) {
        ref.current = {
          editor,
          setWords,
          getWords: () => {
            if (!editor) {
              return null;
            }
            return fromEditorToWords(editor.getJSON() as any);
          },
          scrollToBottom: () => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
          },
          appendWords: (newWords: Word[]) => {
            if (!editor || !newWords.length) {
              return;
            }

            const jsonFragment = fromWordsToEditor(newWords).content;

            if (!jsonFragment?.length) {
              return;
            }

            const endPos = editor.state.doc.content.size;

            isProgrammaticUpdate.current = true;
            editor
              .chain()
              .insertContentAt(endPos, jsonFragment)
              .run();
            isProgrammaticUpdate.current = false;
          },
          toText: () => {
            if (!editor) {
              return "";
            }

            const doc = editor.getJSON();
            if (!doc?.content) {
              return "";
            }

            const lines: string[] = [];

            for (const speakerBlock of doc.content) {
              if (speakerBlock.type !== "speaker" || !speakerBlock.content) {
                continue;
              }

              const attrs = speakerBlock.attrs as SpeakerAttributes || {};
              const speakerLabel = getSpeakerLabel(attrs);

              const textContent = speakerBlock.content
                .filter((node: any) => node.type === "text")
                .map((node: any) => node.text || "")
                .join("")
                .trim();

              if (textContent) {
                lines.push(`[${speakerLabel}]\n${textContent}`);
              }
            }

            return lines.join("\n\n");
          },
        };
      }
    }, [editor]);

    useEffect(() => {
      if (!editor) {
        return;
      }
      const container = scrollContainerRef.current;
      const followTail = shouldFollowTranscriptTail(container, editor);
      editor.view.dispatch(
        editor.state.tr.setMeta(transcriptPreviewsKey, editable ? {} : previews ?? {}).setMeta("addToHistory", false),
      );
      if (followTail && container) {
        container.scrollTop = container.scrollHeight;
      }
    }, [editor, previews, editable, i18n.locale]);

    useEffect(() => {
      if (editor) {
        editor.setEditable(editable);
      }
    }, [editor, editable]);

    return (
      <div role="textbox" className="h-full flex-1 flex flex-col overflow-hidden user-select-text">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-8 bg-sidebar user-select-text"
        >
          <EditorContent editor={editor} className="min-h-full pb-4 user-select-text" />
        </div>
      </div>
    );
  },
);

TranscriptEditor.displayName = "TranscriptEditor";

export default TranscriptEditor;
