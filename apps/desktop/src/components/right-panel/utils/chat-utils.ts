import { i18n } from "@lingui/core";

export const formatDate = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Same day
  if (diffDays === 0) {
    return i18n._("Today");
  }

  // Yesterday
  if (diffDays === 1) {
    return i18n._("Yesterday");
  }

  // Less than a week - show days ago
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  // Less than a month - show weeks
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w`;
  }

  // More than a month - show month/day or full date
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();

  if (date.getFullYear() === now.getFullYear()) {
    return `${month} ${day}`;
  }

  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

export const focusInput = (chatInputRef: React.RefObject<HTMLTextAreaElement>) => {
  if (chatInputRef.current) {
    chatInputRef.current.focus();
  }
};
