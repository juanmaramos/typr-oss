export const WORKSPACE_WIDTH_PX = {
  note: 704,
  project: 760,
} as const;

export type WorkspaceWidth = keyof typeof WORKSPACE_WIDTH_PX;

export const WORKSPACE_COLUMN_CLASS = "mx-auto w-full min-w-0";

export function getWorkspaceColumnStyle(width: WorkspaceWidth) {
  return {
    maxWidth: `${WORKSPACE_WIDTH_PX[width]}px`,
  } as const;
}
