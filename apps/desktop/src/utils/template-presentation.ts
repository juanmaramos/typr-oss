import type { Template } from "@typr/plugin-db";

type TemplateLike = Pick<Template, "id" | "title"> | null | undefined;

const TEMPLATE_ICON_BY_ID: Record<string, string> = {
  "default-meeting-notes": "ri-team-line",
  "default-one-on-one": "ri-group-3-line",
  "default-customer-call": "ri-phone-line",
  "default-job-interview": "ri-briefcase-4-line",
  "default-project-planning": "ri-slideshow-line",
};

const LEADING_EMOJI_REGEX = /^[\p{Extended_Pictographic}\uFE0F]+\s*/u;

export function getTemplateLeadingEmoji(title?: string | null): string | null {
  const match = (title || "").match(LEADING_EMOJI_REGEX);
  return match ? match[0].trim() : null;
}

export function stripTemplateLeadingEmoji(title?: string | null): string {
  return (title || "").replace(LEADING_EMOJI_REGEX, "").trim();
}

export function getTemplateEditableName(title?: string | null): string {
  return (title || "").replace(LEADING_EMOJI_REGEX, "");
}

export function getTemplateDisplayName(title?: string | null, fallback = "Untitled Template"): string {
  const stripped = stripTemplateLeadingEmoji(title);
  return stripped || fallback;
}

export function getTemplateIconName(template: TemplateLike): string {
  if (!template) {
    return "ri-layout-grid-line";
  }

  if (template.id && TEMPLATE_ICON_BY_ID[template.id]) {
    return TEMPLATE_ICON_BY_ID[template.id];
  }

  const title = stripTemplateLeadingEmoji(template.title).toLowerCase();

  if (title.includes("1-on-1") || title.includes("one-on-one")) {
    return "ri-group-3-line";
  }
  if (title.includes("customer") || title.includes("call") || title.includes("sales")) {
    return "ri-phone-line";
  }
  if (title.includes("interview") || title.includes("hiring") || title.includes("candidate")) {
    return "ri-briefcase-4-line";
  }
  if (title.includes("project") || title.includes("planning") || title.includes("kickoff")) {
    return "ri-slideshow-line";
  }
  if (title.includes("review") || title.includes("notes") || title.includes("meeting")) {
    return "ri-team-line";
  }

  return "ri-file-list-3-line";
}
