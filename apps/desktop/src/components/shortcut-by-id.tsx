import { getShortcutDisplay } from "@/data/shortcuts";
import Shortcut from "./shortcut";

interface ShortcutByIdProps {
  shortcutId: string;
  className?: string;
  variant?: "default" | "outline" | "ghost";
}

/**
 * Component that displays a keyboard shortcut by its ID from the centralized shortcuts data.
 * This ensures consistency across the app and eliminates the need to hardcode shortcuts in multiple places.
 */
export function ShortcutById({ shortcutId, className, variant = "default" }: ShortcutByIdProps) {
  const shortcutDisplay = getShortcutDisplay(shortcutId);

  if (!shortcutDisplay) {
    console.warn(`Shortcut with ID "${shortcutId}" not found`);
    return null;
  }

  return (
    <Shortcut
      macDisplay={shortcutDisplay.macDisplay}
      windowsDisplay={shortcutDisplay.windowsDisplay}
      variant={variant}
    />
  );
}
