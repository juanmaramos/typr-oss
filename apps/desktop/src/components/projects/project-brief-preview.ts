import type { ProjectBriefView } from "@/components/projects/project-brief-panel";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const PROJECT_BRIEF_PREVIEW_ENABLED = import.meta.env.DEV;

export type ProjectBriefPreviewMode = "no-notes" | "not-generated" | "generating" | "current" | "stale" | "failed";

export const PROJECT_BRIEF_PREVIEW_MODES: Array<{ value: ProjectBriefPreviewMode; label: string }> = [
  {
    value: "no-notes",
    get label() {
      return i18n._(msg`No notes`);
    },
  },
  {
    value: "not-generated",
    get label() {
      return i18n._(msg`Not generated`);
    },
  },
  {
    value: "generating",
    get label() {
      return i18n._(msg`Generating`);
    },
  },
  {
    value: "current",
    get label() {
      return i18n._(msg`Current`);
    },
  },
  {
    value: "stale",
    get label() {
      return i18n._(msg`Stale`);
    },
  },
  {
    value: "failed",
    get label() {
      return i18n._(msg`Failed`);
    },
  },
];

export function getMockProjectBrief(
  projectName: string,
  sourceCount: number,
  isStale = false,
): ProjectBriefView | null {
  if (!PROJECT_BRIEF_PREVIEW_ENABLED || sourceCount === 0) {
    return null;
  }

  const noteLabel = sourceCount === 1 ? i18n._(msg`note`) : i18n._(msg`notes`);

  return {
    sourceCount,
    updatedAt: "2026-05-04T10:30:00.000Z",
    isStale,
    sections: [
      {
        id: "current-state",
        get title() {
          return i18n._(msg`Current understanding`);
        },
        markdown: i18n._(
          msg`${projectName} has enough source material to maintain a working project brief from ${sourceCount} ${noteLabel}. The current direction is to keep project context scoped, readable, and grounded before expanding into workspace-wide Ask.`,
        ),
      },
      {
        id: "recent-updates",
        get title() {
          return i18n._(msg`Recent updates`);
        },
        markdown: i18n._(msg`- Project Ask now starts from the project page and continues in durable Ask threads.
- Files are visible as a project resource surface, but storage and extraction are intentionally not connected yet.
- The brief is moving out of resource tabs and into the right-side reference panel.`),
      },
      {
        id: "important-facts",
        get title() {
          return i18n._(msg`Important facts`);
        },
        markdown: i18n._(msg`- Notes remain the real persisted project sources today.
- The generated brief is display synthesis, not editable source content.
- Files must become project-scoped records before they can participate in Ask or brief generation.`),
      },
      {
        id: "open-questions",
        get title() {
          return i18n._(msg`Open questions`);
        },
        markdown: i18n._(msg`- What source coverage should trigger the first automatic brief?
- How should stale summaries behave when notes are moved between projects?
- Which document types should enter the file pipeline first?`),
      },
      {
        id: "follow-ups",
        get title() {
          return i18n._(msg`Follow-ups`);
        },
        markdown: i18n._(msg`- Wire the real project brief status query and generated markdown.
- Add context snapshots for Project Ask answers.
- Define document ingestion states before files become first-class project sources.`),
      },
      {
        id: "contradictions",
        get title() {
          return i18n._(msg`Contradictions / changes`);
        },
        markdown: i18n._(
          msg`No contradictions are visible in the current mock brief. In the real pipeline, this section should appear only when newer sources change or challenge older guidance.`,
        ),
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
