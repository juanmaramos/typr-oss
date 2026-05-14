import type { ProjectBriefView } from "@/components/projects/project-brief-panel";

export const PROJECT_BRIEF_PREVIEW_ENABLED = import.meta.env.DEV;

export type ProjectBriefPreviewMode = "no-notes" | "not-generated" | "generating" | "current" | "stale" | "failed";

export const PROJECT_BRIEF_PREVIEW_MODES: Array<{ value: ProjectBriefPreviewMode; label: string }> = [
  { value: "no-notes", label: "No notes" },
  { value: "not-generated", label: "Not generated" },
  { value: "generating", label: "Generating" },
  { value: "current", label: "Current" },
  { value: "stale", label: "Stale" },
  { value: "failed", label: "Failed" },
];

export function getMockProjectBrief(
  projectName: string,
  sourceCount: number,
  isStale = false,
): ProjectBriefView | null {
  if (!PROJECT_BRIEF_PREVIEW_ENABLED || sourceCount === 0) {
    return null;
  }

  const noteLabel = sourceCount === 1 ? "note" : "notes";

  return {
    sourceCount,
    updatedAt: "2026-05-04T10:30:00.000Z",
    isStale,
    sections: [
      {
        id: "current-state",
        title: "Current understanding",
        markdown:
          `${projectName} has enough source material to maintain a working project brief from ${sourceCount} ${noteLabel}. The current direction is to keep project context scoped, readable, and grounded before expanding into workspace-wide Ask.`,
      },
      {
        id: "recent-updates",
        title: "Recent updates",
        markdown:
          "- Project Ask now starts from the project page and continues in durable Ask threads.\n- Files are visible as a project resource surface, but storage and extraction are intentionally not connected yet.\n- The brief is moving out of resource tabs and into the right-side reference panel.",
      },
      {
        id: "important-facts",
        title: "Important facts",
        markdown:
          "- Notes remain the real persisted project sources today.\n- The generated brief is display synthesis, not editable source content.\n- Files must become project-scoped records before they can participate in Ask or brief generation.",
      },
      {
        id: "open-questions",
        title: "Open questions",
        markdown:
          "- What source coverage should trigger the first automatic brief?\n- How should stale summaries behave when notes are moved between projects?\n- Which document types should enter the file pipeline first?",
      },
      {
        id: "follow-ups",
        title: "Follow-ups",
        markdown:
          "- Wire the real project brief status query and generated markdown.\n- Add context snapshots for Project Ask answers.\n- Define document ingestion states before files become first-class project sources.",
      },
      {
        id: "contradictions",
        title: "Contradictions / changes",
        markdown:
          "No contradictions are visible in the current mock brief. In the real pipeline, this section should appear only when newer sources change or challenge older guidance.",
      },
    ],
  };
}

export function getProjectBriefForPreviewMode(
  projectName: string,
  sourceCount: number,
  mode: ProjectBriefPreviewMode,
) {
  const effectiveSourceCount = mode === "no-notes" ? 0 : Math.max(1, sourceCount);

  return {
    sourceCount: effectiveSourceCount,
    brief: mode === "current" || mode === "stale"
      ? getMockProjectBrief(projectName, effectiveSourceCount, mode === "stale")
      : null,
  };
}
