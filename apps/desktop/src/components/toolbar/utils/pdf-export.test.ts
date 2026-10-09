// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { appDataDir, writeFile, sessionListParticipants, sessionGetEvent } = vi.hoisted(() => ({
  appDataDir: vi.fn(),
  writeFile: vi.fn(),
  sessionListParticipants: vi.fn(),
  sessionGetEvent: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({ appDataDir }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile }));
vi.mock("@typr/plugin-db", () => ({
  commands: { sessionListParticipants, sessionGetEvent },
}));

import { exportToPDF, type SessionData } from "./pdf-export";

describe("exportToPDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appDataDir.mockResolvedValue("/app/data/");
    writeFile.mockResolvedValue(undefined);
    sessionListParticipants.mockResolvedValue([{ full_name: "Ada Example" }]);
    sessionGetEvent.mockResolvedValue({ name: "Design review", start_date: null, end_date: null });
  });

  it("generates a PDF with session metadata and writes it under app data", async () => {
    const session = {
      id: "synthetic-session",
      title: "Synthetic Review",
      enhanced_memo_html: "<h1>Summary</h1><p>Keep the editor responsive.</p>",
    } as SessionData;

    const path = await exportToPDF(session);

    expect(path).toBe("/app/data/synthetic_review.pdf");
    expect(sessionListParticipants).toHaveBeenCalledWith("synthetic-session");
    expect(sessionGetEvent).toHaveBeenCalledWith("synthetic-session");
    expect(writeFile).toHaveBeenCalledOnce();

    const [writtenPath, bytes] = writeFile.mock.calls[0] as [string, Uint8Array];
    expect(writtenPath).toBe(path);
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toMatch(/^%PDF-1\./);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const pdfText = new TextDecoder().decode(bytes);
    expect(pdfText).toContain("Synthetic Review");
    expect(pdfText).toContain("Design review");
    expect(pdfText).toContain("Ada Example");
    expect(pdfText).toContain("Keep the editor responsive.");
  });
});
