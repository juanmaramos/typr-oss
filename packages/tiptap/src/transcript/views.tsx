import { type Editor as TiptapEditor } from "@tiptap/core";
import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { type ComponentType, memo } from "react";

import { SPEAKER_ID_ATTR, SPEAKER_INDEX_ATTR, SPEAKER_LABEL_ATTR } from "./utils";

export const createSpeakerView = (Comp: SpeakerViewInnerComponent): ComponentType<NodeViewProps> => {
  return memo(({ node, editor }: NodeViewProps) => {
    const speakerId = node.attrs?.[SPEAKER_ID_ATTR] ?? undefined;
    const speakerIndex = node.attrs?.[SPEAKER_INDEX_ATTR] ?? undefined;
    const speakerLabel = node.attrs?.[SPEAKER_LABEL_ATTR] ?? undefined;

    return (
      <NodeViewWrapper className="transcript-speaker">
        <Comp
          speakerId={speakerId}
          speakerIndex={speakerIndex}
          speakerLabel={speakerLabel}
          editorRef={editor}
        />
        <NodeViewContent className="transcript-speaker-content" />
      </NodeViewWrapper>
    );
  }, (prevProps, nextProps) => {
    const prevAttrs = prevProps.node.attrs;
    const nextAttrs = nextProps.node.attrs;

    return prevAttrs[SPEAKER_ID_ATTR] === nextAttrs[SPEAKER_ID_ATTR]
      && prevAttrs[SPEAKER_INDEX_ATTR] === nextAttrs[SPEAKER_INDEX_ATTR]
      && prevAttrs[SPEAKER_LABEL_ATTR] === nextAttrs[SPEAKER_LABEL_ATTR];
  });
};

export type SpeakerViewInnerProps = {
  speakerId: string | undefined;
  speakerIndex: number | undefined;
  speakerLabel: string | undefined;
  editorRef?: TiptapEditor;
};

export type SpeakerViewInnerComponent = (props: SpeakerViewInnerProps) => JSX.Element;
