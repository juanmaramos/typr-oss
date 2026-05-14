export const DEFAULT_PROJECT_ICON_TYPE = "remix";
export const DEFAULT_PROJECT_ICON_VALUE = "ri-folder-3-line";
export const DEFAULT_PROJECT_ICON_COLOR = "neutral";

export const PROJECT_ICON_OPTIONS = [
  { value: "ri-folder-3-line", label: "Folder" },
  { value: "ri-briefcase-4-line", label: "Client" },
  { value: "ri-file-list-3-line", label: "Notes" },
  { value: "ri-chat-3-line", label: "Conversation" },
  { value: "ri-lightbulb-line", label: "Idea" },
  { value: "ri-rocket-line", label: "Launch" },
  { value: "ri-customer-service-2-line", label: "Customer" },
  { value: "ri-team-line", label: "Team" },
  { value: "ri-user-smile-line", label: "Person" },
  { value: "ri-building-4-line", label: "Company" },
  { value: "ri-line-chart-line", label: "Growth" },
  { value: "ri-bar-chart-box-line", label: "Analytics" },
  { value: "ri-global-line", label: "Market" },
  { value: "ri-calendar-check-line", label: "Planning" },
  { value: "ri-flag-line", label: "Milestone" },
  { value: "ri-stack-line", label: "Stack" },
  { value: "ri-book-open-line", label: "Research" },
  { value: "ri-code-box-line", label: "Engineering" },
  { value: "ri-tools-line", label: "Tools" },
  { value: "ri-megaphone-line", label: "Marketing" },
  { value: "ri-shopping-bag-3-line", label: "Commercial" },
  { value: "ri-bank-line", label: "Finance" },
  { value: "ri-flask-line", label: "Experiment" },
  { value: "ri-shield-check-line", label: "Compliance" },
] as const;

export const PROJECT_ICON_COLOR_OPTIONS = [
  {
    value: "neutral",
    label: "Neutral",
    previewClassName: "bg-marker-neutral",
    iconClassName: "bg-marker-neutral-surface text-marker-neutral",
    ringClassName: "ring-marker-neutral",
  },
  {
    value: "ink",
    label: "Ink",
    previewClassName: "bg-marker-ink",
    iconClassName: "bg-marker-ink-surface text-marker-ink",
    ringClassName: "ring-marker-ink",
  },
  {
    value: "indigo",
    label: "Indigo",
    previewClassName: "bg-marker-indigo",
    iconClassName: "bg-marker-indigo-surface text-marker-indigo",
    ringClassName: "ring-marker-indigo",
  },
  {
    value: "blue",
    label: "Blue",
    previewClassName: "bg-marker-blue",
    iconClassName: "bg-marker-blue-surface text-marker-blue",
    ringClassName: "ring-marker-blue",
  },
  {
    value: "teal",
    label: "Teal",
    previewClassName: "bg-marker-teal",
    iconClassName: "bg-marker-teal-surface text-marker-teal",
    ringClassName: "ring-marker-teal",
  },
  {
    value: "violet",
    label: "Violet",
    previewClassName: "bg-marker-violet",
    iconClassName: "bg-marker-violet-surface text-marker-violet",
    ringClassName: "ring-marker-violet",
  },
  {
    value: "rose",
    label: "Rose",
    previewClassName: "bg-marker-rose",
    iconClassName: "bg-marker-rose-surface text-marker-rose",
    ringClassName: "ring-marker-rose",
  },
  {
    value: "amber",
    label: "Amber",
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
