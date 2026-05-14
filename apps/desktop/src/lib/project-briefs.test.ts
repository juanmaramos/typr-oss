import type { ProjectBrief } from "@typr/plugin-db";
import { describe, expect, it } from "vitest";

import { isProjectBriefStale, projectBriefMatchesFreshness } from "./project-briefs";

const baseBrief: ProjectBrief = {
  id: "brief-1",
  project_id: "project-1",
  markdown: "## Project brief\nPreview\n\n## Facts\nSupported fact [S1].",
  status: "Current",
  source_count: 1,
  source_limit: 300,
  source_fingerprint: "source-only",
  model_id: "auto",
  prompt_template_version: "project-brief-v1",
  error_message: null,
  generated_at: "2026-05-05T00:00:00.000Z",
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const freshness = {
  sourceCount: 1,
  sourceFingerprint: "source-only",
  legacyProjectMetadataFingerprint: "legacy-project-metadata",
};

describe("project brief freshness", () => {
  it("keeps a brief current when only project metadata changed", () => {
    const legacyBrief = {
      ...baseBrief,
      source_fingerprint: "legacy-project-metadata",
    };

    expect(projectBriefMatchesFreshness(legacyBrief, freshness)).toBe(true);
    expect(isProjectBriefStale(legacyBrief, freshness)).toBe(false);
  });

  it("marks a brief stale when source materials changed", () => {
    const staleBrief = {
      ...baseBrief,
      source_fingerprint: "old-source-materials",
    };

    expect(projectBriefMatchesFreshness(staleBrief, freshness)).toBe(false);
    expect(isProjectBriefStale(staleBrief, freshness)).toBe(true);
  });

  it("does not mark empty projects stale", () => {
    expect(isProjectBriefStale(baseBrief, {
      ...freshness,
      sourceCount: 0,
    })).toBe(false);
  });
});
