import { describe, expect, it } from "vitest";

import {
  deriveNoteTitleFromContent,
  resolveNoteTitle,
  sanitizeGeneratedNoteTitle,
} from "./note-title";

describe("note title generation guards", () => {
  it("accepts concise generated titles", () => {
    expect(sanitizeGeneratedNoteTitle("AI agents reshaping software creation")).toBe(
      "AI agents reshaping software creation",
    );
  });

  it("rejects repeated title loops", () => {
    expect(
      sanitizeGeneratedNoteTitle(
        "Decrypting Naval Insights Title Needed Navigate Securely Navigate Securely Navigate Securely",
      ),
    ).toBeNull();
  });

  it("rejects missing-space local model output", () => {
    expect(sanitizeGeneratedNoteTitle("Theriseofaiagentsreshapingsoftwarecreation")).toBeNull();
  });

  it("trims dangling cloud title continuations", () => {
    expect(sanitizeGeneratedNoteTitle("Naval and Nivei explore Vibe Coding – using")).toBe(
      "Naval and Nivei explore Vibe Coding",
    );
  });

  it("rejects incomplete thinking output from reasoning models", () => {
    expect(
      sanitizeGeneratedNoteTitle(
        "<think>\nWe are given a meeting note with the following structure:",
      ),
    ).toBeNull();
  });

  it("rejects explanation-style output from reasoning models", () => {
    expect(
      sanitizeGeneratedNoteTitle(
        "We are given a meeting note about Naval's comments on secure navigation.",
      ),
    ).toBeNull();
  });

  it("rejects meta title output", () => {
    expect(sanitizeGeneratedNoteTitle("Milestone title for a meeting note")).toBeNull();
  });

  it("derives a usable fallback from summary content instead of generic headings", () => {
    expect(
      deriveNoteTitleFromContent(`
        <h2>Summary</h2>
        <p>The rise of AI coding agents marks a significant inflection point in software creation.</p>
      `),
    ).toBe("The rise of AI coding agents");
  });

  it("removes dash asides before trimming fallback titles", () => {
    expect(
      deriveNoteTitleFromContent(`
        <h2>Summary</h2>
        <p>Naval explains how &quot;Vibe Coding&quot; – using AI coding agents like Claude Opus 4.5 to create custom apps on demand – is democratizing app development and changing software creation.</p>
      `),
    ).toBe("Vibe Coding is democratizing app development");
  });

  it("falls back when generated output is unsafe", () => {
    expect(
      resolveNoteTitle({
        generatedTitle: "Navigate Securely Navigate Securely Navigate Securely Navigate Securely",
        enhancedContent: "<p>AI agents are reshaping software creation workflows.</p>",
        existingTitle: "Original video title",
      }),
    ).toEqual({
      title: "AI agents are reshaping software creation",
      source: "content",
    });
  });
});
