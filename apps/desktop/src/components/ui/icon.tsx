import {
  type RemixiconComponentType,
  RiAddLine,
  RiArrowDownSLine,
  RiArrowUpCircleLine,
  RiArrowUpLine,
  RiArrowUpSLine,
  RiCalendarCheckLine,
  RiCalendarLine,
  RiChat3Line,
  RiChatAiLine,
  RiCheckLine,
  RiClosedCaptioningLine,
  RiEditBoxLine,
  RiExternalLinkLine,
  RiFeedbackLine,
  RiFileCopyLine,
  RiFocus3Line,
  RiFolder3Line,
  RiFolder5Line,
  RiHashtag,
  RiInformationLine,
  RiKeyboardLine,
  RiKeyLine,
  RiLayoutGridLine,
  RiLoader4Line,
  RiPauseFill,
  RiPlayFill,
  RiRadioButtonLine,
  RiRefreshLine,
  RiSearchLine,
  RiSettings3Line,
  RiShare2Line,
  RiSidebarFoldLine,
  RiSideBarLine,
  RiSidebarUnfoldLine,
  RiStickyNoteLine,
  RiStopFill,
} from "@remixicon/react";
import { Bot, Cloud, HardDrive, type LucideIcon, Route, Settings, Sparkles } from "lucide-react";

/**
 * Map of Lucide icon names to components
 */
const LUCIDE_ICONS: Record<string, LucideIcon> = {
  HardDrive,
  Cloud,
  Bot,
  Sparkles,
  Settings,
  Route,
};

const REMIX_ICONS: Record<string, RemixiconComponentType> = {
  "ri-search-line": RiSearchLine,
  "ri-sticky-note-line": RiStickyNoteLine,
  "ri-chat-ai-line": RiChatAiLine,
  "ri-chat-3-line": RiChat3Line,
  "ri-folder-3-line": RiFolder3Line,
  "ri-folder-5-line": RiFolder5Line,
  "ri-add-line": RiAddLine,
  "ri-edit-box-line": RiEditBoxLine,
  "ri-side-bar-line": RiSideBarLine,
  "ri-sidebar-fold-line": RiSidebarFoldLine,
  "ri-sidebar-unfold-line": RiSidebarUnfoldLine,
  "ri-layout-grid-line": RiLayoutGridLine,
  "ri-arrow-down-s-line": RiArrowDownSLine,
  "ri-arrow-up-circle-line": RiArrowUpCircleLine,
  "ri-arrow-up-s-line": RiArrowUpSLine,
  "ri-arrow-up-line": RiArrowUpLine,
  "ri-check-line": RiCheckLine,
  "ri-loader-4-line": RiLoader4Line,
  "ri-refresh-line": RiRefreshLine,
  "ri-file-copy-line": RiFileCopyLine,
  "ri-pause-fill": RiPauseFill,
  "ri-play-fill": RiPlayFill,
  "ri-stop-fill": RiStopFill,
  "ri-radio-button-line": RiRadioButtonLine,
  "ri-focus-3-line": RiFocus3Line,
  "ri-calendar-line": RiCalendarLine,
  "ri-calendar-check-line": RiCalendarCheckLine,
  "ri-hashtag": RiHashtag,
  "ri-share-2-line": RiShare2Line,
  "ri-subtitle-line": RiClosedCaptioningLine,
  "ri-settings-3-line": RiSettings3Line,
  "ri-key-line": RiKeyLine,
  "ri-feedback-line": RiFeedbackLine,
  "ri-keyboard-line": RiKeyboardLine,
  "ri-external-link-line": RiExternalLinkLine,
  "ri-information-line": RiInformationLine,
};

interface IconProps {
  name: string;
  className?: string;
}

/**
 * Unified Icon component that handles both Lucide and Remix icons
 * Provides a consistent API for all icon usage in the app
 */
export const Icon = ({ name, className }: IconProps) => {
  const RemixIcon = REMIX_ICONS[name];
  if (RemixIcon) {
    return <RemixIcon className={className} />;
  }

  // Fallback to the font-based class only for icons that have not been mapped yet.
  if (name.startsWith("ri-")) {
    return <i className={`${name} ${className || ""}`} aria-hidden="true" />;
  }

  // Otherwise, look up Lucide icon component
  const LucideIcon = LUCIDE_ICONS[name];
  return LucideIcon ? <LucideIcon className={className} /> : null;
};

/**
 * Helper to check if an icon name is valid
 */
export function isValidIcon(name: string): boolean {
  return name.startsWith("ri-") || name in LUCIDE_ICONS;
}
