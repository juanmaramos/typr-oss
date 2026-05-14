const MAX_TITLE_CHARS = 80;
const MAX_TITLE_WORDS = 6;
const MAX_WORD_CHARS = 24;
const GENERIC_TITLE_WORDS = new Set([
  "summary",
  "note",
  "notes",
  "meeting notes",
  "key takeaways",
  "takeaways",
  "untitled",
  "overview",
]);
const TRAILING_CONNECTOR_WORDS = new Set([
  "about",
  "and",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "through",
  "to",
  "using",
  "via",
  "while",
  "with",
]);

type TitleSource = "generated" | "content" | "existing";

export type ResolvedNoteTitle = {
  title: string;
  source: TitleSource;
};

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripMarkup(input: string): string {
  return decodeBasicEntities(input)
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<think>[\s\S]*$/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/`/g, "");
}

function normalizeCandidate(input: string): string {
  return stripMarkup(input)
    .replace(/\s+[–—]\s+[^–—]+?\s+[–—]\s+/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^(?:title|meeting title|note title|summary title)\s*[:.-]\s*/i, "")
    .replace(/\btitle needed\b/gi, " ")
    .replace(/\buntitled\b/gi, " ")
    .replace(/^["'({[]+|["')}\].,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeLeadingExplainer(input: string): string {
  return input.replace(/^[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,2}\s+explains\s+how\s+/i, "");
}

function trimAtSoftBoundary(input: string): string {
  const match = input.match(/\s+(?:and|while|but)\s+/i);
  if (!match?.index) {
    return input;
  }

  const prefix = input.slice(0, match.index).trim();
  return prefix.split(/\s+/).length >= 4 ? prefix : input;
}

function wordsForAnalysis(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasExcessiveAdjacentRepetition(input: string): boolean {
  const words = wordsForAnalysis(input);
  if (words.length < 6) {
    return false;
  }

  for (let size = 1; size <= Math.min(4, Math.floor(words.length / 3)); size += 1) {
    for (let index = 0; index + size * 3 <= words.length; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      let repeats = 1;

      while (
        index + (repeats + 1) * size <= words.length
        && words.slice(index + repeats * size, index + (repeats + 1) * size).join(" ") === phrase
      ) {
        repeats += 1;
      }

      if (repeats >= 3) {
        return true;
      }
    }
  }

  return false;
}

function collapseSingleAdjacentRepeats(input: string): string {
  const words = input.split(/\s+/).filter(Boolean);
  const output: string[] = [];

  for (const word of words) {
    const previous = output[output.length - 1];
    if (previous && previous.toLowerCase() === word.toLowerCase()) {
      continue;
    }
    output.push(word);
  }

  return output.join(" ");
}

function firstLineCandidate(input: string): string | null {
  const candidate = stripMarkup(input)
    .split(/\r?\n/)
    .map(line => normalizeCandidate(line))
    .find(Boolean);

  return candidate ?? null;
}

function stripDanglingTitleEnding(input: string): string {
  let title = input
    .replace(/\s+[–—]\s+(?:about|and|at|but|by|for|from|in|into|of|on|or|through|to|using|via|while|with)\b.*$/i, "")
    .replace(/[.,;:!?–—-]+$/g, "")
    .trim();

  while (title) {
    const words = title.split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1]?.toLowerCase().replace(/[.,;:!?–—-]+$/g, "");

    if (!lastWord || !TRAILING_CONNECTOR_WORDS.has(lastWord)) {
      return title;
    }

    title = words.slice(0, -1).join(" ").replace(/[.,;:!?–—-]+$/g, "").trim();
  }

  return title;
}

function trimTitle(input: string): string {
  const withoutDanglingSuffix = stripDanglingTitleEnding(input);
  const words = withoutDanglingSuffix.split(/\s+/).filter(Boolean).slice(0, MAX_TITLE_WORDS);
  let title = words.join(" ");

  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS).replace(/\s+\S*$/, "");
  }

  return stripDanglingTitleEnding(title);
}

function isGenericTitle(input: string): boolean {
  return GENERIC_TITLE_WORDS.has(input.toLowerCase());
}

export function sanitizeGeneratedNoteTitle(rawTitle: string): string | null {
  if (/^\s*(?:<think\b|we are given\b|okay,\s*the user\b|i need to\b|looking at\b)/i.test(rawTitle)) {
    return null;
  }

  if (/\b(?:meeting note|meeting notes|note title|summary title|title for a meeting)\b/i.test(rawTitle)) {
    return null;
  }

  if (hasExcessiveAdjacentRepetition(rawTitle)) {
    return null;
  }

  const candidate = firstLineCandidate(rawTitle);
  if (!candidate) {
    return null;
  }

  const title = trimTitle(collapseSingleAdjacentRepeats(candidate));
  if (!title) {
    return null;
  }

  const words = title.split(/\s+/).filter(Boolean);
  const hasMissingSpaces = words.length === 1 && title.length >= 18;
  const hasVeryLongWord = words.some(word => word.length > MAX_WORD_CHARS);

  if (hasMissingSpaces || hasVeryLongWord || isGenericTitle(title)) {
    return null;
  }

  return title;
}

function markdownHeadingCandidate(content: string): string | null {
  const match = stripMarkup(content).match(/^\s{0,3}#{1,2}\s+(.+)$/m);
  return match?.[1] ?? null;
}

function htmlHeadingCandidate(content: string): string | null {
  const match = content.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  return match?.[1] ?? null;
}

function sanitizeFallbackTitle(rawTitle: string | null | undefined): string | null {
  if (!rawTitle) {
    return null;
  }

  const candidate = trimAtSoftBoundary(
    removeLeadingExplainer(normalizeCandidate(rawTitle)).replace(/[“”"]/g, ""),
  );
  if (!candidate || hasExcessiveAdjacentRepetition(candidate)) {
    return null;
  }

  const title = trimTitle(collapseSingleAdjacentRepeats(candidate));
  if (!title || isGenericTitle(title)) {
    return null;
  }

  return title;
}

function htmlParagraphCandidate(content: string): string | null {
  const matches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);

  for (const match of matches) {
    const candidate = sanitizeFallbackTitle(match[1]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function deriveNoteTitleFromContent(content: string): string | null {
  return (
    sanitizeFallbackTitle(markdownHeadingCandidate(content))
    ?? sanitizeFallbackTitle(htmlHeadingCandidate(content))
    ?? htmlParagraphCandidate(content)
    ?? sanitizeFallbackTitle(firstLineCandidate(content))
  );
}

export function resolveNoteTitle({
  generatedTitle,
  enhancedContent,
  existingTitle,
}: {
  generatedTitle: string;
  enhancedContent: string;
  existingTitle?: string | null;
}): ResolvedNoteTitle | null {
  const generated = sanitizeGeneratedNoteTitle(generatedTitle);
  if (generated) {
    return { title: generated, source: "generated" };
  }

  const fromContent = deriveNoteTitleFromContent(enhancedContent);
  if (fromContent) {
    return { title: fromContent, source: "content" };
  }

  const existing = sanitizeFallbackTitle(existingTitle);
  if (existing) {
    return { title: existing, source: "existing" };
  }

  return null;
}
