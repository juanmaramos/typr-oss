/**
 * Parses a keyboard shortcut string and returns individual keys
 * Handles formats like:
 * - "⌘K" -> ["⌘", "K"]
 * - "Ctrl+Shift+P" -> ["Ctrl", "Shift", "P"]
 * - "⌘⇧I" -> ["⌘", "⇧", "I"]
 * - "⌘⌫" -> ["⌘", "⌫"]
 */
export function parseShortcut(shortcut: string): string[] {
  return shortcut
    .split(/(\+|⇧|⌘|⌥|⌃|⌫|Ctrl|Alt|Shift|Cmd|Meta|Delete)/g)
    .filter((part) => part && part !== "+");
}
