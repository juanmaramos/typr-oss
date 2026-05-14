import {
  getWorkspaceColumnStyle,
  WORKSPACE_COLUMN_CLASS,
  WORKSPACE_WIDTH_PX,
} from "@/components/layout/workspace-width";

export const NOTE_WORKSPACE_MAX_WIDTH_PX = WORKSPACE_WIDTH_PX.note;
export const NOTE_WORKSPACE_COLUMN_CLASS = WORKSPACE_COLUMN_CLASS;
export const NOTE_WORKSPACE_COLUMN_STYLE = getWorkspaceColumnStyle("note");
