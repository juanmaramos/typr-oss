import { type Tab } from "./types";

export function TabIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "general":
      return <i className="ri-settings-3-line text-base" />;
    case "profile":
      return <i className="ri-user-3-line text-base" />;
    case "privacy":
      return <i className="ri-shield-keyhole-line text-base" />;
    case "notifications":
      return <i className="ri-notification-badge-line text-base" />;
    case "sound":
      return <i className="ri-sound-module-line text-base" />;
    case "feedback":
      return <i className="ri-feedback-line text-base" />;
    case "ai":
      return <i className="ri-sparkling-line text-base" />;
    case "calendar":
      return <i className="ri-calendar-line text-base" />;
    case "templates":
      return <i className="ri-dashboard-line text-base" />;
    case "integrations":
      return <i className="ri-apps-2-add-line text-base" />;
    case "lab":
      return <i className="ri-flask-line text-base" />;
    case "about":
      return <i className="ri-information-line text-base" />;
    default:
      return null;
  }
}
