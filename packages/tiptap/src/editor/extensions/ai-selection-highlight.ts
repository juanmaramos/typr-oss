/**
 * AI Selection Highlight Extension
 * Based on TipTap's official recommendation for persistent visual selection
 * Uses ProseMirror Decorations (not Marks) to maintain highlight across focus changes
 *
 * Reference: TipTap support recommendation - use inline decorations for UI-only state
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const AIHighlightPluginKey = new PluginKey("ai-highlight");

// TypeScript declaration for commands
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiHighlight: {
      /**
       * Apply AI selection highlight (decoration) to a range
       */
      setAISelection: (range?: { from: number; to: number }) => ReturnType;
      /**
       * Clear AI selection highlight
       */
      unsetAISelection: () => ReturnType;
    };
  }
}

export const AIHighlight = Extension.create({
  name: "aiHighlight",

  addCommands() {
    return {
      // Call this when user presses Cmd+L - freezes visual selection
      setAISelection: (range) => ({ tr, state, dispatch }) => {
        const { from, to } = range || state.selection;

        // Save the selection to the plugin state
        if (dispatch) {
          tr.setMeta(AIHighlightPluginKey, { type: "SET", from, to });
        }
        return true;
      },
      // Call this when user accepts/rejects changes - clears highlight
      unsetAISelection: () => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(AIHighlightPluginKey, { type: "UNSET" });
        }
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: AIHighlightPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            // 1. Check for our custom commands
            const meta = tr.getMeta(AIHighlightPluginKey);

            if (meta?.type === "SET") {
              return DecorationSet.create(tr.doc, [
                Decoration.inline(meta.from, meta.to, {
                  class: "ai-selection-highlight", // CSS class
                }),
              ]);
            } else if (meta?.type === "UNSET") {
              return DecorationSet.empty;
            }

            // 2. CRITICAL: Map the decoration through document changes
            // If AI streams edits or user types, this keeps highlight attached to text
            return oldSet.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
