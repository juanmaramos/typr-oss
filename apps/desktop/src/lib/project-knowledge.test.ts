import type {
  ProjectBrief,
  ProjectBriefSource,
  ProjectFile,
  ProjectFileExtraction,
  ProjectSourceDigest,
  Session,
} from "@typr/plugin-db";
import { describe, expect, it } from "vitest";

import {
  buildExtractiveDigest,
  chunkProjectSourceText,
  evaluateProjectKnowledgeHealth,
  evaluateProjectSourceDigestReadiness,
  selectSourceDigestChunks,
  sessionToKnowledgeMaterial,
} from "./project-knowledge";

const baseSession: Session = {
  id: "note-1",
  created_at: "2026-05-05T00:00:00.000Z",
  visited_at: "2026-05-05T00:00:00.000Z",
  user_id: "user-1",
  calendar_event_id: null,
  title: "Project Standup",
  raw_memo_html: "",
  enhanced_memo_html: null,
  auto_enhanced_memo_html: null,
  words: [],
  record_start: null,
  record_end: null,
  pre_meeting_memo_html: null,
  source_type: null,
  source_metadata: null,
  space_id: null,
  needs_enhance: false,
};

const baseDigest: ProjectSourceDigest = {
  project_id: "project-1",
  source_type: "note",
  source_id: "note-1",
  title: "Project Standup",
  digest_source_kind: "ExistingAiNotes",
  source_hash: "hash-1",
  summary: "Summary",
  claims_json: "[]",
  entities_json: "[]",
  open_questions_json: "[]",
  decisions_json: "[]",
  risks_json: "[]",
  contradictions_json: "[]",
  digest_markdown: "Summary: Summary",
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const baseFile: ProjectFile = {
  id: "file-1",
  project_id: "project-1",
  name: "Workforce.pdf",
  mime_type: "application/pdf",
  size_bytes: 100,
  storage_path: "/tmp/workforce.pdf",
  status: "Done",
  error_message: null,
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const baseExtraction: ProjectFileExtraction = {
  file_id: "file-1",
  status: "Done",
  text_content: "Readable file text",
  content_hash: "file-hash",
  char_count: 18,
  error_message: null,
  extracted_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const baseBrief: ProjectBrief = {
  id: "brief-1",
  project_id: "project-1",
  markdown: "## Project brief\nPreview\n\n## Facts\nSupported fact [S1].",
  status: "Current",
  source_count: 1,
  source_limit: 300,
  source_fingerprint: "fingerprint",
  model_id: "auto",
  prompt_template_version: "project-brief-v1",
  error_message: null,
  generated_at: "2026-05-05T00:00:00.000Z",
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
};

const baseBriefSource: ProjectBriefSource = {
  brief_id: "brief-1",
  source_type: "note",
  source_id: "note-1",
  source_key: "S1",
  title: "Project Standup",
  content_hash: "hash-1",
  created_at: "2026-05-05T00:00:00.000Z",
};

describe("project knowledge source compilation", () => {
  it("chunks long source text into ordered bounded chunks", () => {
    const text = [
      "First paragraph describes the problem.",
      "Second paragraph describes the decision.",
      "x".repeat(2600),
      "Final paragraph captures the follow-up.",
    ].join("\n\n");

    const chunks = chunkProjectSourceText(text);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toEqual({
      locator: "Chunk 1",
      text: "First paragraph describes the problem.\n\nSecond paragraph describes the decision.",
    });
    expect(chunks.every(chunk => chunk.text.length <= 2200)).toBe(true);
    expect(chunks.map(chunk => chunk.locator)).toEqual(chunks.map((_, index) => `Chunk ${index + 1}`));
  });

  it("selects source digest chunks across the full document instead of only the beginning", () => {
    const chunks = Array.from({ length: 20 }, (_, index) => ({
      chunk_index: index,
      text_content: `chunk-${index}`,
    }));

    const selected = selectSourceDigestChunks(chunks, 6);

    expect(selected.map(chunk => chunk.chunk_index)).toContain(0);
    expect(selected.map(chunk => chunk.chunk_index)).toContain(19);
    expect(selected.some(chunk => chunk.chunk_index > 6 && chunk.chunk_index < 14)).toBe(true);
    expect(selected).toHaveLength(6);
  });

  it("builds an extractive digest fallback from selected chunks", () => {
    const fallback = buildExtractiveDigest(
      {
        digestSeedKind: "GeneratedFromChunks",
        sourceHash: "hash-1",
        sourceId: "file-1",
        sourceType: "file",
        text: "Workforce Insights source body.",
        title: "Workforce Insights.pdf",
      },
      [
        { source_locator: "Page 1", text_content: "Mercer Workforce Insights tracks headcount planning." },
        { source_locator: "Page 2", text_content: "The tool includes manager views and workforce trends." },
      ],
    );

    expect(fallback.generated.summary).toContain("Mercer Workforce Insights");
    expect(fallback.generated.contradictionsOrChanges).toEqual([]);
    expect(fallback.digestMarkdown).toContain("Compiled excerpts:");
    expect(fallback.digestMarkdown).toContain("Page 1");
    expect(fallback.digestMarkdown).toContain("Page 2");
  });

  it("uses existing AI Notes as the note digest seed before raw notes or transcript", async () => {
    const material = await sessionToKnowledgeMaterial({
      ...baseSession,
      enhanced_memo_html: "<h1>AI Notes</h1><p>Use the Mercer Workforce Insights summary.</p>",
      raw_memo_html: "<p>Raw transcript should not seed the digest.</p>",
      words: [{
        text: "Transcript should not seed the digest either.",
        speaker: null,
        confidence: null,
        start_ms: null,
        end_ms: null,
      }],
    });

    expect(material).toMatchObject({
      digestSeedKind: "ExistingAiNotes",
      sourceId: "note-1",
      sourceType: "note",
      title: "Project Standup",
      text: "AI Notes Use the Mercer Workforce Insights summary.",
    });
  });

  it("falls back to source context when a note has no AI Notes", async () => {
    const material = await sessionToKnowledgeMaterial({
      ...baseSession,
      raw_memo_html: "<p>Manual note body.</p>",
      words: [{
        text: "Transcript body.",
        speaker: null,
        confidence: null,
        start_ms: null,
        end_ms: null,
      }],
    });

    expect(material?.digestSeedKind).toBe("GeneratedFromChunks");
    expect(material?.text).toContain("Raw notes:");
    expect(material?.text).toContain("Manual note body.");
    expect(material?.text).toContain("Transcript:");
    expect(material?.text).toContain("Transcript body.");
  });

  it("reports healthy compiled knowledge when sources, digests, files, and citations match", () => {
    const health = evaluateProjectKnowledgeHealth({
      brief: baseBrief,
      briefSources: [baseBriefSource],
      digests: [baseDigest],
      fileExtractions: [baseExtraction],
      files: [baseFile],
      materials: [{
        digestSeedKind: "ExistingAiNotes",
        sourceHash: "hash-1",
        sourceId: "note-1",
        sourceType: "note",
        text: "Summary",
        title: "Project Standup",
      }],
    });

    expect(health.status).toBe("ok");
    expect(health.issues).toEqual([]);
  });

  it("reports missing and stale source digests", () => {
    const health = evaluateProjectKnowledgeHealth({
      digests: [{ ...baseDigest, source_hash: "old-hash" }],
      fileExtractions: [],
      files: [],
      materials: [
        {
          digestSeedKind: "ExistingAiNotes",
          sourceHash: "hash-1",
          sourceId: "note-1",
          sourceType: "note",
          text: "Summary",
          title: "Project Standup",
        },
        {
          digestSeedKind: "GeneratedFromChunks",
          sourceHash: "hash-2",
          sourceId: "note-2",
          sourceType: "note",
          text: "Other summary",
          title: "Other note",
        },
      ],
    });

    expect(health.status).toBe("warning");
    expect(health.issueCounts.SourceDigestStale).toBe(1);
    expect(health.issueCounts.SourceMissingDigest).toBe(1);
  });

  it("identifies source digest readiness issues for queue dependencies", () => {
    const readiness = evaluateProjectSourceDigestReadiness(
      [
        {
          digestSeedKind: "ExistingAiNotes",
          sourceHash: "hash-1",
          sourceId: "note-1",
          sourceType: "note",
          text: "Summary",
          title: "Project Standup",
        },
        {
          digestSeedKind: "GeneratedFromChunks",
          sourceHash: "hash-2",
          sourceId: "note-2",
          sourceType: "note",
          text: "Other summary",
          title: "Other note",
        },
        {
          digestSeedKind: "GeneratedFromChunks",
          sourceHash: "file-hash",
          sourceId: "file-1",
          sourceType: "file",
          text: "File text",
          title: "Workforce.pdf",
        },
      ],
      [
        baseDigest,
        {
          ...baseDigest,
          source_id: "file-1",
          source_type: "file",
          title: "Workforce.pdf",
          source_hash: "old-file-hash",
        },
      ],
    );

    expect(readiness).toMatchObject({
      failed: 0,
      missing: 1,
      ready: 1,
      stale: 1,
      total: 3,
    });
    expect(readiness.issues.map(issue => `${issue.status}:${issue.sourceType}:${issue.sourceId}`)).toEqual([
      "missing:note:note-2",
      "stale:file:file-1",
    ]);
  });

  it("reports failed and unsupported file extraction states", () => {
    const health = evaluateProjectKnowledgeHealth({
      digests: [],
      fileExtractions: [
        { ...baseExtraction, file_id: "file-1", status: "Failed", error_message: "parse failed" },
        { ...baseExtraction, file_id: "file-2", status: "Unsupported", error_message: "unsupported" },
      ],
      files: [
        baseFile,
        { ...baseFile, id: "file-2", name: "scan.pdf" },
      ],
      materials: [],
    });

    expect(health.status).toBe("error");
    expect(health.issueCounts.FileExtractionFailed).toBe(1);
    expect(health.issueCounts.FileExtractionUnsupported).toBe(1);
  });

  it("reports brief citations that cannot be resolved to current sources", () => {
    const health = evaluateProjectKnowledgeHealth({
      brief: {
        ...baseBrief,
        markdown: "## Project brief\nPreview\n\n## Facts\nOld fact [S1]. Unknown fact [S9].",
      },
      briefSources: [baseBriefSource],
      digests: [],
      fileExtractions: [],
      files: [],
      materials: [],
    });

    expect(health.status).toBe("error");
    expect(health.issueCounts.BriefCitationMissingSource).toBe(1);
    expect(health.issueCounts.BriefCitationUnknownKey).toBe(1);
  });
});
