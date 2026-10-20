import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface ShortcutItem {
  id: string;
  category: MessageDescriptor;
  description: MessageDescriptor;
  macKey: string;
  windowsKey: string;
}

// Define categories
const NAVIGATION = msg`Navigation`;
const NOTES = msg`Notes`;
const TRANSCRIPTION = msg`Transcription`;
const SYSTEM = msg`System`;
const EDITING = msg`Editing`;

// Create shortcut data dynamically with translations
export const shortcutsData: ShortcutItem[] = [
  // Navigation & Panels
  {
    id: "toggle-left-sidebar",
    category: NAVIGATION,
    description: msg`Toggle left sidebar`,
    macKey: "⌘.",
    windowsKey: "Ctrl+.",
  },
  {
    id: "toggle-assistant",
    category: NAVIGATION,
    description: msg`Toggle assistant panel`,
    macKey: "⌥⌘.",
    windowsKey: "Ctrl+Alt+.",
  },
  {
    id: "new-chat",
    category: NAVIGATION,
    description: msg`Create new chat conversation`,
    macKey: "⌘⇧N",
    windowsKey: "Ctrl+Shift+N",
  },
  {
    id: "toggle-transcript",
    category: NAVIGATION,
    description: msg`Open transcript panel`,
    macKey: "⌘T",
    windowsKey: "Ctrl+T",
  },
  {
    id: "add-text-to-chat",
    category: EDITING,
    description: msg`Add selected text to chat`,
    macKey: "⌘L",
    windowsKey: "Ctrl+L",
  },
  {
    id: "improve-writing",
    category: EDITING,
    description: msg`Improve selected text`,
    macKey: "⌘⇧I",
    windowsKey: "Ctrl+Shift+I",
  },
  {
    id: "accept-changes",
    category: EDITING,
    description: msg`Accept AI changes`,
    macKey: "⌘↩",
    windowsKey: "Ctrl+Enter",
  },
  {
    id: "reject-changes",
    category: EDITING,
    description: msg`Reject AI changes`,
    macKey: "⌘⌫",
    windowsKey: "Ctrl+Backspace",
  },
  {
    id: "open-search",
    category: NAVIGATION,
    description: msg`Open search/command palette`,
    macKey: "⌘K",
    windowsKey: "Ctrl+K",
  },
  {
    id: "show-shortcuts",
    category: NAVIGATION,
    description: msg`Show keyboard shortcuts`,
    macKey: "⌘0",
    windowsKey: "Ctrl+0",
  },

  // Note Management
  {
    id: "new-note",
    category: NOTES,
    description: msg`Create new note`,
    macKey: "⌘N",
    windowsKey: "Ctrl+N",
  },
  {
    id: "note-actions",
    category: NOTES,
    description: msg`Open note actions menu`,
    macKey: "⌘⇧.",
    windowsKey: "Ctrl+Shift+.",
  },

  // Transcription
  {
    id: "start-transcript",
    category: TRANSCRIPTION,
    description: msg`Start new transcript`,
    macKey: "⌘⇧T",
    windowsKey: "Ctrl+Shift+T",
  },
  {
    id: "pause-transcript",
    category: TRANSCRIPTION,
    description: msg`Pause/resume transcript`,
    macKey: "⌘⇧P",
    windowsKey: "Ctrl+Shift+P",
  },
  {
    id: "stop-summarize-transcript",
    category: TRANSCRIPTION,
    description: msg`Stop and summarize transcript`,
    macKey: "⌘⇧S",
    windowsKey: "Ctrl+Shift+S",
  },
  {
    id: "import-youtube-video",
    category: TRANSCRIPTION,
    description: msg`Transcribe YouTube video`,
    macKey: "⌘⇧Y",
    windowsKey: "Ctrl+Shift+Y",
  },
  {
    id: "upload-audio",
    category: TRANSCRIPTION,
    description: msg`Upload audio for transcription`,
    macKey: "⌘⇧U",
    windowsKey: "Ctrl+Shift+U",
  },

  // Settings & Help
  {
    id: "open-settings",
    category: SYSTEM,
    description: msg`Open settings`,
    macKey: "⌘,",
    windowsKey: "Ctrl+,",
  },
  {
    id: "close-modal",
    category: SYSTEM,
    description: msg`Close modal/dialog`,
    macKey: "Esc",
    windowsKey: "Esc",
  },

  // Text Editing (Future)
  {
    id: "find-in-note",
    category: EDITING,
    description: msg`Find in current note`,
    macKey: "⌘F",
    windowsKey: "Ctrl+F",
  },
  {
    id: "bold-text",
    category: EDITING,
    description: msg`Bold selected text`,
    macKey: "⌘B",
    windowsKey: "Ctrl+B",
  },
  {
    id: "italic-text",
    category: EDITING,
    description: msg`Italic selected text`,
    macKey: "⌘I",
    windowsKey: "Ctrl+I",
  },
  {
    id: "underline-text",
    category: EDITING,
    description: msg`Underline selected text`,
    macKey: "⌘U",
    windowsKey: "Ctrl+U",
  },
];

export const getShortcutsByCategory = () => {
  const categories = Array.from(new Set(shortcutsData.map(item => item.category)));
  return categories.map(category => ({
    category,
    shortcuts: shortcutsData.filter(item => item.category === category),
  }));
};

// Utility function to get a shortcut by ID
export const getShortcutById = (id: string): ShortcutItem | undefined => {
  return shortcutsData.find(shortcut => shortcut.id === id);
};

// Helper function to get display strings for a shortcut
export const getShortcutDisplay = (id: string): { macDisplay: string; windowsDisplay: string } | null => {
  const shortcut = getShortcutById(id);
  if (!shortcut) {
    return null;
  }

  return {
    macDisplay: shortcut.macKey,
    windowsDisplay: shortcut.windowsKey,
  };
};
