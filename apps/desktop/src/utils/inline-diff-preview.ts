/**
 * Inline Diff Preview Utilities
 * Shows AI-generated changes directly in the editor with highlighting
 * Uses Saru's diff-match-patch approach for word-level diffs
 */

import type { TiptapEditor } from "@typr/tiptap/editor";
import { diffEditor } from "@typr/tiptap/shared";

interface DiffPreviewState {
  originalContent: string; // HTML before changes
  hasActivePreview: boolean;
}

// Store original content before showing preview
const diffPreviewState = new Map<string, DiffPreviewState>();

/**
 * Show inline diff preview in editor
 * Replaces editor content with a diffed version showing changes
 */
export const showInlineDiffPreview = (
  editor: TiptapEditor,
  sessionId: string,
  newHTML: string,
): boolean => {
  if (!editor || !sessionId) {
    console.error("[InlineDiff] Missing editor or sessionId");
    return false;
  }

  try {
    // Save original content
    const originalHTML = editor.getHTML();
    diffPreviewState.set(sessionId, {
      originalContent: originalHTML,
      hasActivePreview: true,
    });

    // Get current document as JSON
    const oldDoc = editor.state.doc.toJSON();
    console.log("🔍 [Diff Debug] Old doc structure:", JSON.stringify(oldDoc).substring(0, 500));

    // Parse new HTML to get new document JSON
    // Temporarily set new content to parse it
    editor.commands.setContent(newHTML);
    const newDoc = editor.state.doc.toJSON();
    console.log("🔍 [Diff Debug] New doc structure:", JSON.stringify(newDoc).substring(0, 500));

    // Compare a sample paragraph to see differences
    console.log("🔍 [Diff Debug] HTML comparison:");
    console.log("  Old HTML length:", originalHTML.length);
    console.log("  New HTML length:", newHTML.length);
    console.log("  Are they identical?", originalHTML === newHTML);

    // Calculate diff using Saru's algorithm
    const schema = editor.schema;
    console.log("🔍 [Diff Debug] Calling diffEditor...");
    const diffedDoc = diffEditor(schema, oldDoc, newDoc);
    console.log("🔍 [Diff Debug] Diff completed, checking for marks...");

    // Check if any nodes have diffMark (only log if none found - that's an error)
    let markedNodesCount = 0;
    diffedDoc.descendants((node) => {
      if (node.marks.some(mark => mark.type.name === "diffMark")) {
        markedNodesCount++;
      }
    });

    if (markedNodesCount === 0) {
      console.warn("⚠️ [InlineDiff] No diff marks found - documents might be identical");
    }

    // Apply the diffed document using ProseMirror transaction (like Saru does)
    const tr = editor.state.tr
      .replaceWith(0, editor.state.doc.content.size, diffedDoc.content)
      .setMeta("addToHistory", false)
      .setMeta("external", true);

    // Use requestAnimationFrame for smooth update (Saru pattern)
    requestAnimationFrame(() => {
      try {
        editor.view.dispatch(tr);

        // Auto-scroll to first changed node (smart scrolling)
        // Note: AI selection highlight is already applied via decoration (persists automatically)
        setTimeout(() => {
          scrollToFirstChange(editor, sessionId);
        }, 150);
      } catch (err) {
        console.error("[InlineDiff] Failed to dispatch transaction:", err);
      }
    });

    // Keep editor editable so user can modify AI suggestion (Cursor/Saru pattern)
    // editor.setEditable(false); // ← Intentionally keep editable!

    return true;
  } catch (error) {
    console.error("[InlineDiff] Failed to show preview:", error);
    return false;
  }
};

/**
 * Accept inline changes - remove diff marks and keep content
 * Following Saru's pattern: delete "deleted" nodes, keep "inserted" nodes
 */
export const acceptInlineDiff = (editor: TiptapEditor, sessionId: string): boolean => {
  if (!editor || !sessionId) {
    return false;
  }

  const state = diffPreviewState.get(sessionId);

  // Check if there are any diff marks in the document (even if state is missing)
  let hasDiffMarks = false;
  const diffMarkType = editor.state.schema.marks.diffMark;
  if (diffMarkType) {
    editor.state.doc.descendants((node) => {
      if (node.marks.some(mark => mark.type === diffMarkType)) {
        hasDiffMarks = true;
      }
    });
  }

  if (!hasDiffMarks) {
    console.warn("[InlineDiff] No diff marks found in document - nothing to accept");
    return false;
  }

  if (!state || !state.hasActivePreview) {
    console.warn("[InlineDiff] Preview state missing, but diff marks exist - proceeding with accept");
  }

  try {
    // Get FRESH state from editor
    const editorState = editor.state;
    const diffMarkType = editorState.schema.marks.diffMark;

    if (!diffMarkType) {
      console.error("[InlineDiff] diffMark not found in schema!");
      return false;
    }

    // Step 1: Find parent nodes (lists) that contain deleted text, and delete them entirely
    // This handles structural changes (bullets → paragraphs) more cleanly
    const deletedTextPositions: number[] = [];

    // First, find all deleted text positions
    editorState.doc.descendants((node, pos) => {
      if (
        node.isText && node.marks.find(m => m.type === diffMarkType && (m.attrs.type === -1 || m.attrs.type === "-1"))
      ) {
        deletedTextPositions.push(pos);
      }
    });

    console.log(`[Accept] Found ${deletedTextPositions.length} deleted text nodes`);

    // NEW APPROACH: Delete individual list items that contain deleted text
    // This keeps the list structure but removes only the items with deleted content
    if (deletedTextPositions.length > 0) {
      const listItemsToDelete = new Set<number>(); // Track list items to delete
      const listsToDelete = new Set<number>(); // Track entire lists to delete

      // First pass: Find list items where MOST content is deleted (not just a prefix)
      editorState.doc.descendants((node, pos) => {
        if (node.type.name === "listItem") {
          // Calculate percentage of deleted text in this list item
          let totalTextLength = 0;
          let deletedTextLength = 0;

          node.descendants((child) => {
            if (child.isText) {
              totalTextLength += child.text?.length || 0;

              const isDeleted = child.marks.find(m =>
                m.type === diffMarkType && (m.attrs.type === -1 || m.attrs.type === "-1")
              );

              if (isDeleted) {
                deletedTextLength += child.text?.length || 0;
              }
            }
          });

          // Only delete entire list item if >50% of content is deleted
          // This prevents deleting items when only a number prefix like "1." is removed
          if (totalTextLength > 0) {
            const deletionPercentage = (deletedTextLength / totalTextLength) * 100;

            if (deletionPercentage > 50) {
              listItemsToDelete.add(pos);
              console.log(
                `[Accept] 📋 List item at ${pos} has ${
                  deletionPercentage.toFixed(0)
                }% deleted - will delete entire item`,
              );
            } else if (deletedTextLength > 0) {
              console.log(
                `[Accept] ℹ️  List item at ${pos} has only ${
                  deletionPercentage.toFixed(0)
                }% deleted - will delete text only (keeping item)`,
              );
            }
          }
        }
      });

      // Second pass: Check if entire lists should be deleted (all items removed)
      editorState.doc.descendants((node, pos) => {
        if (node.type.name === "bulletList" || node.type.name === "orderedList") {
          let totalListItems = 0;
          let deletedListItems = 0;

          node.descendants((child, childPos) => {
            if (child.type.name === "listItem") {
              totalListItems++;
              const absolutePos = pos + childPos + 1; // +1 for proper offset
              if (listItemsToDelete.has(absolutePos)) {
                deletedListItems++;
              }
            }
          });

          // If ALL items in this list are deleted, delete the entire list structure
          if (totalListItems > 0 && deletedListItems === totalListItems) {
            listsToDelete.add(pos);
            console.log(
              `[Accept] 📋 List at ${pos} has ALL items deleted (${deletedListItems}/${totalListItems}) - will delete entire list`,
            );
          } else if (deletedListItems > 0) {
            console.log(
              `[Accept] 📋 List at ${pos} has partial deletions (${deletedListItems}/${totalListItems}) - will delete individual items`,
            );
          }
        }
      });

      // Execute deletions: Entire lists first, then individual items
      let tr = editor.state.tr;

      if (listsToDelete.size > 0) {
        // Delete entire lists (reverse order for position stability)
        const sortedLists = Array.from(listsToDelete).sort((a, b) => b - a);
        for (const pos of sortedLists) {
          const node = editor.state.doc.nodeAt(pos);
          if (node) {
            console.log(`[Accept] Deleting entire ${node.type.name} at ${pos}, size ${node.nodeSize}`);
            tr = tr.delete(pos, pos + node.nodeSize);
          }
        }

        // Remove deleted lists from listItemsToDelete to avoid double-deletion
        editorState.doc.descendants((node, pos) => {
          if (listsToDelete.has(pos)) {
            node.descendants((child, childPos) => {
              if (child.type.name === "listItem") {
                listItemsToDelete.delete(pos + childPos + 1);
              }
            });
          }
        });
      }

      // Delete individual list items (not part of fully-deleted lists)
      if (listItemsToDelete.size > 0) {
        // Get fresh doc state after list deletions
        const currentDoc = tr.doc;
        const itemsToDelete: { pos: number; size: number }[] = [];

        currentDoc.descendants((node, pos) => {
          if (node.type.name === "listItem" && listItemsToDelete.has(pos)) {
            itemsToDelete.push({ pos, size: node.nodeSize });
          }
        });

        // Delete in reverse order for position stability
        itemsToDelete.sort((a, b) => b.pos - a.pos);
        for (const item of itemsToDelete) {
          console.log(`[Accept] Deleting list item at ${item.pos}, size ${item.size}`);
          tr = tr.delete(item.pos, item.pos + item.size);
        }

        console.log(`[Accept] ✅ Deleted ${itemsToDelete.length} list items`);
      }

      // Apply transaction if any deletions were made
      if (listsToDelete.size > 0 || listItemsToDelete.size > 0) {
        tr.setMeta("addToHistory", true);
        editor.view.dispatch(tr);
        console.log(
          `[Accept] ✅ Deleted ${listsToDelete.size} entire lists and ${listItemsToDelete.size} individual list items`,
        );
      } else {
        // Fallback: Delete individual deleted text nodes (for non-list edits)
        const rangesToDelete: { from: number; to: number }[] = [];

        editorState.doc.descendants((node, pos) => {
          if (
            node.isText
            && node.marks.find(m => m.type === diffMarkType && (m.attrs.type === -1 || m.attrs.type === "-1"))
          ) {
            rangesToDelete.push({ from: pos, to: pos + node.nodeSize });
          }
        });

        if (rangesToDelete.length > 0) {
          let textTr = editor.state.tr;
          for (let i = rangesToDelete.length - 1; i >= 0; i--) {
            textTr = textTr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
          }
          textTr.setMeta("addToHistory", true);
          editor.view.dispatch(textTr);
          console.log(`[Accept] Deleted ${rangesToDelete.length} text nodes`);
        }
      }
    }

    // Step 2: Remove all diff marks and selection context marks from document
    const docSize = editor.state.tr.doc.content.size;
    console.log(`[Accept] Removing marks from doc size: ${docSize}`);

    if (docSize > 0) {
      let marksTr = editor.state.tr;
      marksTr = marksTr.removeMark(0, docSize, diffMarkType);
      marksTr.setMeta("addToHistory", false);
      editor.view.dispatch(marksTr);
      console.log(`[Accept] All diff marks removed`);
    }

    // Clear AI selection highlight (decoration)
    editor.commands.unsetAISelection();
    console.log(`[Accept] Cleared AI selection highlight`);

    // Clear preview state
    diffPreviewState.delete(sessionId);

    return true;
  } catch (error) {
    console.error("[InlineDiff] Failed to accept changes:", error);
    return false;
  }
};

/**
 * Reject inline changes - restore original content
 */
export const rejectInlineDiff = (editor: TiptapEditor, sessionId: string): boolean => {
  if (!editor || !sessionId) {
    return false;
  }

  const state = diffPreviewState.get(sessionId);
  if (!state || !state.hasActivePreview) {
    console.warn("[InlineDiff] No active preview to reject");
    return false;
  }

  try {
    console.log("❌ [InlineDiff] Rejecting changes, restoring original");

    // Restore original content
    editor.commands.setContent(state.originalContent);

    // Clear AI selection highlight (decoration)
    editor.commands.unsetAISelection();

    // Editor stays editable throughout (no need to re-enable)

    // Clear preview state
    diffPreviewState.delete(sessionId);

    return true;
  } catch (error) {
    console.error("[InlineDiff] Failed to reject changes:", error);
    return false;
  }
};

/**
 * Check if there's an active inline diff preview
 */
export const hasActiveInlineDiff = (sessionId: string): boolean => {
  const state = diffPreviewState.get(sessionId);
  return state?.hasActivePreview || false;
};

/**
 * Get original content before preview was shown
 */
export const getOriginalContent = (sessionId: string): string | null => {
  const state = diffPreviewState.get(sessionId);
  return state?.originalContent || null;
};

/**
 * Smart scroll to first changed node
 * Scrolls to show the first insertion or deletion in viewport
 */
const scrollToFirstChange = (editor: TiptapEditor, sessionId: string): void => {
  try {
    const { state } = editor;
    const diffMarkType = state.schema.marks.diffMark;
    let firstChangePos: number | null = null;

    // Find first node with diffMark
    state.doc.descendants((node, pos) => {
      if (firstChangePos !== null) {
        return false; // Stop if already found
      }

      if (node.marks.some(mark => mark.type === diffMarkType)) {
        firstChangePos = pos;
        return false; // Stop searching
      }
    });

    if (firstChangePos === null) {
      console.log("🔍 [InlineDiff] No changes found to scroll to");
      return;
    }

    // Scrolling to first change

    // Use Tiptap's scrollIntoView command
    editor.chain()
      .setTextSelection(firstChangePos!)
      .scrollIntoView()
      .run();

    // Alternative: Manual scroll to element
    // Find the DOM node at this position and scroll to it
    requestAnimationFrame(() => {
      const editorElement = editor.view.dom;
      const scrollableParent = editorElement.closest(".overflow-y-auto");

      if (scrollableParent && firstChangePos !== null) {
        // Get DOM coords for the position
        const coords = editor.view.coordsAtPos(firstChangePos);
        const scrollTop = coords.top - scrollableParent.getBoundingClientRect().top + scrollableParent.scrollTop;

        scrollableParent.scrollTo({
          top: Math.max(0, scrollTop - 100), // 100px offset from top for context
          behavior: "smooth",
        });
      }
    });
  } catch (error) {
    console.error("[InlineDiff] Failed to scroll to changes:", error);
  }
};
