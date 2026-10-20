import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { fromWordsToEditor, getSpeakerLabel, SPEAKER_ID_ATTR, SPEAKER_INDEX_ATTR, type Word } from "./utils";

export type TranscriptPreviews = Record<string, Word[]>;
export const transcriptPreviewsKey = new PluginKey<{ previews: TranscriptPreviews; decorations: DecorationSet }>(
  "transcript-previews",
);

function decorationsFor(doc: Node, previews: TranscriptPreviews): DecorationSet {
  const decorations: Decoration[] = [];
  const last = doc.lastChild;
  const entries = Object.entries(previews).filter(([, words]) => words.length > 0);
  const empty = !doc.textContent;
  if (empty && entries.length && last) {
    decorations.push(Decoration.node(0, last.nodeSize, { class: "transcript-preview-empty" }));
  }
  for (const [channel, words] of entries) {
    const blocks = fromWordsToEditor(words).content;
    for (const [index, block] of blocks.entries()) {
      const text = block.content.map(node => node.text).join("");
      const sameSpeaker = !empty && last
        && [SPEAKER_ID_ATTR, SPEAKER_INDEX_ATTR].every(attr => last.attrs[attr] === block.attrs[attr]);
      const labelText = getSpeakerLabel(block.attrs, "");
      const position = sameSpeaker ? doc.content.size - 1 : empty ? 0 : doc.content.size;
      decorations.push(Decoration.widget(position, () => {
        const element = document.createElement(sameSpeaker ? "span" : "div");
        element.className = sameSpeaker ? "transcript-preview" : "transcript-speaker transcript-preview";
        element.dataset.transcriptPreview = channel;
        element.contentEditable = "false";
        if (sameSpeaker) {
          element.textContent = ` ${text}`;
        } else {
          if (labelText) {
            const label = document.createElement("div");
            label.className = "transcript-speaker-label";
            label.textContent = labelText;
            element.append(label);
          }
          const content = document.createElement("div");
          content.className = "transcript-speaker-content";
          content.textContent = text;
          element.append(content);
        }
        return element;
      }, { key: JSON.stringify([channel, index, block.attrs, text, !!sameSpeaker, labelText]), side: 1 }));
    }
  }
  return DecorationSet.create(doc, decorations);
}

// Hypotheses live in plugin state, never in the document or its serialization.
export const TranscriptPreview = Extension.create({
  name: "transcriptPreview",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: transcriptPreviewsKey,
        state: {
          init: () => ({ previews: {}, decorations: DecorationSet.empty }),
          apply(transaction, previous) {
            const update: TranscriptPreviews | undefined = transaction.getMeta(transcriptPreviewsKey);
            if (!update && !transaction.docChanged) {
              return previous;
            }
            const previews = update ?? previous.previews;
            return { previews, decorations: decorationsFor(transaction.doc, previews) };
          },
        },
        props: { decorations: state => transcriptPreviewsKey.getState(state)?.decorations },
      }),
    ];
  },
});
