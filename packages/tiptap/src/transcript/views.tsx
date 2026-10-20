import { useLingui } from "@lingui/react";
import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { memo } from "react";

import { getSpeakerLabel, SPEAKER_ID_ATTR, SPEAKER_INDEX_ATTR, SPEAKER_LABEL_ATTR } from "./utils";

export const SpeakerView = memo(({ node }: NodeViewProps) => {
  useLingui();
  const label = getSpeakerLabel(node.attrs, "");
  return (
    <NodeViewWrapper className="transcript-speaker">
      {label && <div className="transcript-speaker-label" contentEditable={false}>{label}</div>}
      <NodeViewContent className="transcript-speaker-content" />
    </NodeViewWrapper>
  );
}, (previous, next) => {
  const before = previous.node.attrs;
  const after = next.node.attrs;
  return before[SPEAKER_ID_ATTR] === after[SPEAKER_ID_ATTR]
    && before[SPEAKER_INDEX_ATTR] === after[SPEAKER_INDEX_ATTR]
    && before[SPEAKER_LABEL_ATTR] === after[SPEAKER_LABEL_ATTR];
});
