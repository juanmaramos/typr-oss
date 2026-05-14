export type Tab =
  | "general"
  | "profile"
  | "privacy"
  | "calendar"
  | "ai"
  | "notifications"
  | "sound"
  | "templates"
  | "feedback"
  | "integrations"
  | "lab"
  | "about";

export const TABS: { name: Tab; icon: string }[] = [
  { name: "general", icon: "ri-settings-3-line" },
  { name: "profile", icon: "ri-user-3-line" },
  { name: "privacy", icon: "ri-shield-keyhole-line" },
  { name: "calendar", icon: "ri-calendar-line" },
  { name: "ai", icon: "ri-sparkling-line" },
  { name: "notifications", icon: "ri-notification-badge-line" },
  { name: "sound", icon: "ri-sound-module-line" },
  { name: "templates", icon: "ri-dashboard-line" },
  { name: "integrations", icon: "ri-apps-2-add-line" },
  { name: "feedback", icon: "ri-feedback-line" },
  { name: "lab", icon: "ri-flask-line" },
  { name: "about", icon: "ri-information-line" },
];
