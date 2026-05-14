import type { ProjectFile, ProjectSourceChunk, ProjectSourceDigest } from "@typr/plugin-db";
import { describe, expect, it } from "vitest";

import { buildAskSnapshotSources, selectAskEvidenceChunks } from "./ask";

const chunk = (overrides: Partial<ProjectSourceChunk>): ProjectSourceChunk => ({
  id: `chunk-${overrides.source_id ?? "source"}-${overrides.chunk_index ?? 0}`,
  project_id: "project-1",
  source_type: "file",
  source_id: "file-1",
  chunk_index: 0,
  source_locator: null,
  title: "Workforce Insights",
  text_content: "",
  content_hash: "hash",
  char_count: 0,
  source_hash: "source-hash",
  created_at: "2026-05-05T00:00:00.000Z",
  updated_at: "2026-05-05T00:00:00.000Z",
  ...overrides,
});

describe("Ask evidence chunk selection", () => {
  it("selects matching chunks from sources included in the digest context", () => {
    const selected = selectAskEvidenceChunks(
      [
        chunk({ source_id: "file-1", chunk_index: 0, text_content: "Payroll operations notes." }),
        chunk({ source_id: "file-1", chunk_index: 1, text_content: "Mercer Workforce Insights dashboard rollout." }),
        chunk({ source_id: "file-2", chunk_index: 0, text_content: "Unrelated benefits note." }),
      ],
      "What is the Workforce Insights rollout about?",
      new Map([
        ["file:file-1", "S1"],
        ["file:file-2", "S2"],
      ]),
    );

    expect(selected.map(item => `${item.sourceKey}:${item.chunk.chunk_index}`)).toEqual(["S1:1"]);
  });

  it("falls back to first chunks when the question has no lexical match", () => {
    const selected = selectAskEvidenceChunks(
      [
        chunk({ source_id: "file-1", chunk_index: 0, text_content: "First file." }),
        chunk({ source_id: "file-1", chunk_index: 1, text_content: "Second file chunk." }),
        chunk({ source_id: "file-2", chunk_index: 0, text_content: "Other file." }),
      ],
      "Summarize the project.",
      new Map([
        ["file:file-1", "S1"],
        ["file:file-2", "S2"],
      ]),
    );

    expect(selected.map(item => `${item.sourceKey}:${item.chunk.chunk_index}`)).toEqual(["S1:0", "S2:0"]);
  });
});

describe("Ask snapshot sources", () => {
  it("keeps stored file paths so file citations can open from Ask", () => {
    const digest: ProjectSourceDigest = {
      project_id: "project-1",
      source_type: "file",
      source_id: "file-1",
      title: "Guidelines.pdf",
      digest_source_kind: "GeneratedFromChunks",
      source_hash: "source-hash",
      summary: "Summary",
      claims_json: "[]",
      entities_json: "[]",
      open_questions_json: "[]",
      decisions_json: "[]",
      risks_json: "[]",
      contradictions_json: "[]",
      digest_markdown: "Summary: Guidelines",
      created_at: "2026-05-05T00:00:00.000Z",
      updated_at: "2026-05-05T00:00:00.000Z",
    };
    const file: ProjectFile = {
      id: "file-1",
      project_id: "project-1",
      name: "Guidelines.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      storage_path: "/tmp/project-files/file-1-Guidelines.pdf",
      status: "Done",
      error_message: null,
      created_at: "2026-05-05T00:00:00.000Z",
      updated_at: "2026-05-05T00:00:00.000Z",
    };

    expect(buildAskSnapshotSources([digest], [file])[0]).toMatchObject({
      fileId: "file-1",
      key: "S1",
      sourceType: "file",
      storagePath: "/tmp/project-files/file-1-Guidelines.pdf",
    });
  });
});
