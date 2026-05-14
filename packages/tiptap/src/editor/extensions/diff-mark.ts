/**
 * DiffMark Extension
 * Highlights inserted and deleted text in the editor
 * Used for showing AI-generated changes before accepting
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export interface DiffMarkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diffMark: {
      /**
       * Set diff mark on selection
       */
      setDiffMark: (type: "inserted" | "deleted") => ReturnType;
      /**
       * Remove diff mark from selection
       */
      unsetDiffMark: () => ReturnType;
      /**
       * Clear all diff marks from document
       */
      clearAllDiffMarks: () => ReturnType;
    };
  }
}

export const DiffMark = Mark.create<DiffMarkOptions>({
  name: "diffMark",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      type: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-diff-type"),
        renderHTML: (attributes) => {
          if (!attributes.type) {
            return {};
          }
          return {
            "data-diff-type": attributes.type,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-diff-type]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const type = mark.attrs.type;
    // Styling is handled purely via CSS based on data-diff-type attribute
    // This is the cleanest approach - CSS handles all visual styling
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-diff-type": type,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setDiffMark: (type) => ({ commands }) => {
        return commands.setMark(this.name, { type });
      },
      unsetDiffMark: () => ({ commands }) => {
        return commands.unsetMark(this.name);
      },
      clearAllDiffMarks: () => ({ tr, dispatch }) => {
        if (!dispatch) {
          return false;
        }

        const { doc } = tr;
        let modified = false;

        doc.descendants((node, pos) => {
          if (node.marks.some((mark) => mark.type.name === this.name)) {
            const from = pos;
            const to = pos + node.nodeSize;
            tr.removeMark(from, to, this.type);
            modified = true;
          }
        });

        return modified;
      },
    };
  },
});
