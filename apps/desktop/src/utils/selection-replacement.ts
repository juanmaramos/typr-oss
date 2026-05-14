import type { TiptapEditor } from "@typr/tiptap/editor";

/**
 * Replace entire document with new HTML content
 * TipTap AI Toolkit approach - use setContent for whole document
 */
export const replaceDocumentHTML = (
  editor: TiptapEditor,
  newHTML: string,
): boolean => {
  if (!editor || typeof newHTML !== "string") {
    console.error("Invalid parameters for HTML replacement");
    return false;
  }

  try {
    // Use TipTap's setContent - this is the canonical way to replace documents
    // It handles HTML parsing, validation, and maintains proper structure
    editor.commands.setContent(newHTML);

    // Focus the editor after replacement
    editor.commands.focus();

    console.log("🔧 [ReplaceHTML] Document replaced with HTML:", newHTML.length, "chars");
    return true;
  } catch (error) {
    console.error("Failed to replace document HTML:", error);
    return false;
  }
};

/**
 * Replace selected text in TipTap editor using exact range positions
 */
export const replaceSelectedText = (
  editor: TiptapEditor,
  range: { from: number; to: number },
  newText: string,
): boolean => {
  if (!editor || !range || typeof newText !== "string") {
    console.error("Invalid parameters for text replacement");
    return false;
  }

  try {
    // TipTap best practice: Convert plain text to structured HTML to preserve formatting
    // This prevents text cramping and maintains proper paragraph/line break structure

    // Split on double newlines (or more) for paragraph boundaries
    const paragraphs = newText.split(/\n\n+/).filter((p) => p.trim());

    let formattedContent: string;

    if (paragraphs.length > 1) {
      // Multiple paragraphs - format as proper HTML blocks
      formattedContent = paragraphs
        .map((p) => {
          // Preserve single line breaks within paragraphs as <br>
          // DON'T filter out empty lines - they create intentional spacing
          const lines = p.split("\n");
          const withBreaks = lines.join("<br>");
          return `<p>${withBreaks}</p>`;
        })
        .join("");

      console.log("🔧 [ReplaceText] Formatting as multiple paragraphs:", paragraphs.length);
    } else {
      // Single paragraph - preserve line breaks as <br> tags
      // DON'T filter - preserve intentional blank lines
      const lines = newText.split("\n");
      formattedContent = lines.join("<br>");

      // Wrap in paragraph if we have content
      if (formattedContent.trim()) {
        formattedContent = `<p>${formattedContent}</p>`;
      }

      console.log("🔧 [ReplaceText] Formatting as single paragraph");
    }

    // Use TipTap's insertContentAt with properly formatted HTML structure
    editor.commands.insertContentAt(
      { from: range.from, to: range.to },
      formattedContent,
    );

    // Focus the editor after replacement
    editor.commands.focus();

    return true;
  } catch (error) {
    console.error("Failed to replace selected text:", error);
    return false;
  }
};

/**
 * Get currently selected text and its position range
 */
export const getSelectedText = (editor: TiptapEditor): {
  text: string;
  range: { from: number; to: number };
} | null => {
  if (!editor) {
    return null;
  }

  const { from, to } = editor.state.selection;

  // No selection if cursor is at single position
  if (from === to) {
    return null;
  }

  // Extract text between positions
  const text = editor.state.doc.textBetween(from, to);

  // Only return valid selections with actual text content
  if (!text || text.trim().length === 0) {
    return null;
  }

  return {
    text: text.trim(),
    range: { from, to },
  };
};
