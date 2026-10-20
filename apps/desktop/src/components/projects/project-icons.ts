export const DEFAULT_PROJECT_ICON_TYPE = "remix";
export const DEFAULT_PROJECT_ICON_VALUE = "ri-folder-3-line";
export const DEFAULT_PROJECT_ICON_COLOR = "neutral";

export const PROJECT_ICON_OPTIONS = [
  { value: "ri-folder-3-line" },
  { value: "ri-briefcase-4-line" },
  { value: "ri-file-list-3-line" },
  { value: "ri-chat-3-line" },
  { value: "ri-lightbulb-line" },
  { value: "ri-rocket-line" },
  { value: "ri-customer-service-2-line" },
  { value: "ri-team-line" },
  { value: "ri-user-smile-line" },
  { value: "ri-building-4-line" },
  { value: "ri-line-chart-line" },
  { value: "ri-bar-chart-box-line" },
  { value: "ri-global-line" },
  { value: "ri-calendar-check-line" },
  { value: "ri-flag-line" },
  { value: "ri-stack-line" },
  { value: "ri-book-open-line" },
  { value: "ri-code-box-line" },
  { value: "ri-tools-line" },
  { value: "ri-megaphone-line" },
  { value: "ri-shopping-bag-3-line" },
  { value: "ri-bank-line" },
  { value: "ri-flask-line" },
  { value: "ri-shield-check-line" },
] as const;

export const PROJECT_ICON_COLOR_OPTIONS = [
  {
    value: "neutral",

    previewClassName: "bg-marker-neutral",
    iconClassName: "bg-marker-neutral-surface text-marker-neutral",
    ringClassName: "ring-marker-neutral",
  },
  {
    value: "ink",

    previewClassName: "bg-marker-ink",
    iconClassName: "bg-marker-ink-surface text-marker-ink",
    ringClassName: "ring-marker-ink",
  },
  {
    value: "indigo",

    previewClassName: "bg-marker-indigo",
    iconClassName: "bg-marker-indigo-surface text-marker-indigo",
    ringClassName: "ring-marker-indigo",
  },
  {
    value: "blue",

    previewClassName: "bg-marker-blue",
    iconClassName: "bg-marker-blue-surface text-marker-blue",
    ringClassName: "ring-marker-blue",
  },
  {
    value: "teal",

    previewClassName: "bg-marker-teal",
    iconClassName: "bg-marker-teal-surface text-marker-teal",
    ringClassName: "ring-marker-teal",
  },
  {
    value: "violet",

    previewClassName: "bg-marker-violet",
    iconClassName: "bg-marker-violet-surface text-marker-violet",
    ringClassName: "ring-marker-violet",
  },
  {
    value: "rose",

    previewClassName: "bg-marker-rose",
    iconClassName: "bg-marker-rose-surface text-marker-rose",
    ringClassName: "ring-marker-rose",
  },
  {
    value: "amber",

    previewClassName: "bg-marker-amber",
    iconClassName: "bg-marker-amber-surface text-marker-amber",
    ringClassName: "ring-marker-amber",
  },
] as const;

export type ProjectIconValue = typeof PROJECT_ICON_OPTIONS[number]["value"];
export type ProjectIconColor = typeof PROJECT_ICON_COLOR_OPTIONS[number]["value"];

export function getProjectIconValue(value?: string | null): ProjectIconValue {
  const match = PROJECT_ICON_OPTIONS.find(option => option.value === value);
  return match?.value ?? DEFAULT_PROJECT_ICON_VALUE;
}

export function getProjectIconColor(value?: string | null): ProjectIconColor {
  const match = PROJECT_ICON_COLOR_OPTIONS.find(option => option.value === value);
  return match?.value ?? DEFAULT_PROJECT_ICON_COLOR;
}

export function getProjectIconColorClassName(value?: string | null): string {
  const color = getProjectIconColor(value);
  return PROJECT_ICON_COLOR_OPTIONS.find(option => option.value === color)?.iconClassName
    ?? PROJECT_ICON_COLOR_OPTIONS[0].iconClassName;
}
