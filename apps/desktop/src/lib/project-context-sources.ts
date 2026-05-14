import { listProjectFileExtractions, listProjectFiles } from "@/lib/project-files";
import { listIncludedSessionsByProject } from "@/lib/projects";
import type { Session } from "@typr/plugin-db";

export type ProjectContextSource = {
  contentHash: string;
  contentLength: number;
  sourceId: string;
  sourceType: "note" | "file";
  storagePath?: string;
  text: string;
  title: string;
  visitedAt: string;
};

export type ProjectContextSourceOptions = {
  fileChars: number;
  fileLimit: number;
  noteChars: number;
  noteLimit: number;
  totalChars?: number;
};

export type ProjectContextSourceResult = {
  includedSessionCount: number;
  projectFileCount: number;
  sources: ProjectContextSource[];
};

export async function buildProjectContextSourceResult(
  projectId: string,
  options: ProjectContextSourceOptions,
): Promise<ProjectContextSourceResult> {
  const [sessions, files, fileExtractions] = await Promise.all([
    listIncludedSessionsByProject(projectId, options.noteLimit, null),
    listProjectFiles(projectId),
    listProjectFileExtractions(projectId),
  ]);

  const sources: ProjectContextSource[] = [];
  let remainingBudget = options.totalChars ?? Number.POSITIVE_INFINITY;
  let noteCount = 0;

  for (const session of sessions) {
    if (noteCount >= options.noteLimit || remainingBudget <= 0) {
      break;
    }

    const text = getSessionProjectContextText(session);
    if (!text) {
      continue;
    }

    const excerptLength = Math.min(options.noteChars, remainingBudget);
    const excerpt = text.slice(0, excerptLength);
    remainingBudget -= excerpt.length;

    noteCount += 1;
    sources.push({
      sourceType: "note",
      sourceId: session.id,
      title: session.title?.trim() || "Untitled note",
      visitedAt: session.visited_at,
      contentHash: await hashText(text),
      contentLength: text.length,
      text: excerpt,
    });
  }

  const extractionByFileId = new Map(fileExtractions.map(extraction => [extraction.file_id, extraction]));
  let fileCount = 0;

  for (const file of files) {
    if (fileCount >= options.fileLimit || remainingBudget <= 0) {
      break;
    }

    const extraction = extractionByFileId.get(file.id);
    if (extraction?.status !== "Done") {
      continue;
    }

    const text = extraction.text_content?.trim();
    if (!text) {
      continue;
    }

    const excerptLength = Math.min(options.fileChars, remainingBudget);
    const excerpt = text.slice(0, excerptLength);
    remainingBudget -= excerpt.length;

    fileCount += 1;
    sources.push({
      sourceType: "file",
      sourceId: file.id,
      storagePath: file.storage_path,
      title: file.name,
      visitedAt: file.updated_at,
      contentHash: await hashText(text),
      contentLength: text.length,
      text: excerpt,
    });
  }

  return {
    includedSessionCount: sessions.length,
    projectFileCount: files.length,
    sources,
  };
}

export async function buildProjectContextSources(
  projectId: string,
  options: ProjectContextSourceOptions,
): Promise<ProjectContextSource[]> {
  return (await buildProjectContextSourceResult(projectId, options)).sources;
}

export function getSessionProjectContextText(session: Session) {
  const sections = [
    session.pre_meeting_memo_html ? `Pre-meeting note:\n${htmlToPlainText(session.pre_meeting_memo_html)}` : null,
    session.enhanced_memo_html ? `AI notes:\n${htmlToPlainText(session.enhanced_memo_html)}` : null,
    session.auto_enhanced_memo_html
      ? `Auto-enhanced notes:\n${htmlToPlainText(session.auto_enhanced_memo_html)}`
      : null,
    session.raw_memo_html ? `Raw notes:\n${htmlToPlainText(session.raw_memo_html)}` : null,
    session.words.length > 0 ? `Transcript:\n${wordsToText(session.words)}` : null,
  ]
    .filter((section): section is string => Boolean(section?.trim()))
    .join("\n\n");

  return sections.trim();
}

function wordsToText(words: Session["words"]) {
  return words
    .map(word => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToPlainText(html: string) {
  if (!html.trim()) {
    return "";
  }

  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return (doc.body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function hashText(text: string) {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  return fallbackHashText(text);
}

function fallbackHashText(text: string) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index) | 0;
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
