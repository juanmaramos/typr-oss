export function getInitials(name: string | null | undefined, maxLength: number = 2): string {
  if (!name) {
    return "?";
  }

  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, maxLength);
}

/**
 * Extract all URLs from text
 * Reuses proven regex from url-parser.ts
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  const matches = text.match(urlRegex) || [];
  return matches.map(url => url.startsWith("www.") ? `https://${url}` : url);
}

/**
 * Check if text contains any URLs
 */
export function containsUrl(text: string): boolean {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  return urlRegex.test(text);
}

/**
 * Citation data extracted from Groq response
 */
export interface ParsedCitation {
  number: number;
  sourceId: string;
}

/**
 * Parse Groq citation format and extract citation markers
 * Groq format: 【1†L6-L10】 or 【2†source-name】
 * Converts to [1] [2] format for inline rendering
 */
export function parseCitations(text: string): { text: string; citations: ParsedCitation[] } {
  const citationRegex = /【(\d+)†([^】]+)】/g;
  const citations: ParsedCitation[] = [];

  const cleanText = text.replace(citationRegex, (match, number, sourceId) => {
    citations.push({
      number: parseInt(number),
      sourceId: sourceId.trim(),
    });
    return `[${number}]`; // Replace with inline marker
  });

  return { text: cleanText, citations };
}
