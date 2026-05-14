export interface ShortcutItem {
  id: string;
  category: string;
  description: string;
  macKey: string;
  windowsKey: string;
}

// Define categories
const NAVIGATION = "Navigation";
const NOTES = "Notes";
const TRANSCRIPTION = "Transcription";
const SYSTEM = "System";
const EDITING = "Editing";

// Create shortcut data dynamically with translations
export const shortcutsData: ShortcutItem[] = [
  // Navigation & Panels
  {
    id: "toggle-left-sidebar",
    category: NAVIGATION,
    description: "Toggle left sidebar",
    macKey: "⌘.",
    windowsKey: "Ctrl+.",
  },
  {
    id: "toggle-assistant",
    category: NAVIGATION,
    description: "Toggle assistant panel",
    macKey: "⌥⌘.",
    windowsKey: "Ctrl+Alt+.",
  },
  {
    id: "new-chat",
    category: NAVIGATION,
    description: "Create new chat conversation",
    macKey: "⌘⇧N",
    windowsKey: "Ctrl+Shift+N",
  },
  {
    id: "toggle-transcript",
    category: NAVIGATION,
    description: "Open transcript panel",
    macKey: "⌘T",
    windowsKey: "Ctrl+T",
  },
  {
    id: "add-text-to-chat",
    category: EDITING,
    description: "Add selected text to chat",
    macKey: "⌘L",
    windowsKey: "Ctrl+L",
  },
  {
    id: "improve-writing",
    category: EDITING,
    description: "Improve selected text",
    macKey: "⌘⇧I",
    windowsKey: "Ctrl+Shift+I",
  },
  {
    id: "accept-changes",
    category: EDITING,
    description: "Accept AI changes",
    macKey: "⌘↩",
    windowsKey: "Ctrl+Enter",
  },
  {
    id: "reject-changes",
    category: EDITING,
    description: "Reject AI changes",
    macKey: "⌘⌫",
    windowsKey: "Ctrl+Backspace",
  },
  {
    id: "open-search",
    category: NAVIGATION,
    description: "Open search/command palette",
    macKey: "⌘K",
    windowsKey: "Ctrl+K",
  },
  {
    id: "show-shortcuts",
    category: NAVIGATION,
    description: "Show keyboard shortcuts",
    macKey: "⌘0",
    windowsKey: "Ctrl+0",
  },

  // Note Management
  {
    id: "new-note",
    category: NOTES,
    description: "Create new note",
    macKey: "⌘N",
    windowsKey: "Ctrl+N",
  },
  {
    id: "note-actions",
    category: NOTES,
    description: "Open note actions menu",
    macKey: "⌘⇧.",
    windowsKey: "Ctrl+Shift+.",
  },

  // Transcription
  {
    id: "start-transcript",
    category: TRANSCRIPTION,
    description: "Start new transcript",
    macKey: "⌘⇧T",
    windowsKey: "Ctrl+Shift+T",
  },
  {
    id: "pause-transcript",
    category: TRANSCRIPTION,
    description: "Pause/resume transcript",
    macKey: "⌘⇧P",
    windowsKey: "Ctrl+Shift+P",
  },
  {
    id: "stop-summarize-transcript",
    category: TRANSCRIPTION,
    description: "Stop and summarize transcript",
    macKey: "⌘⇧S",
    windowsKey: "Ctrl+Shift+S",
  },
  {
    id: "import-youtube-video",
    category: TRANSCRIPTION,
    description: "Transcribe YouTube video",
    macKey: "⌘⇧Y",
    windowsKey: "Ctrl+Shift+Y",
  },
  {
    id: "upload-audio",
    category: TRANSCRIPTION,
    description: "Upload audio for transcription",
    macKey: "⌘⇧U",
    windowsKey: "Ctrl+Shift+U",
  },

  // Settings & Help
  {
    id: "open-settings",
    category: SYSTEM,
    description: "Open settings",
    macKey: "⌘,",
    windowsKey: "Ctrl+,",
  },
  {
    id: "close-modal",
    category: SYSTEM,
    description: "Close modal/dialog",
    macKey: "Esc",
    windowsKey: "Esc",
  },

  // Text Editing (Future)
  {
    id: "find-in-note",
    category: EDITING,
    description: "Find in current note",
    macKey: "⌘F",
    windowsKey: "Ctrl+F",
  },
  {
    id: "bold-text",
    category: EDITING,
    description: "Bold selected text",
    macKey: "⌘B",
    windowsKey: "Ctrl+B",
  },
  {
    id: "italic-text",
    category: EDITING,
    description: "Italic selected text",
    macKey: "⌘I",
    windowsKey: "Ctrl+I",
  },
  {
    id: "underline-text",
    category: EDITING,
    description: "Underline selected text",
    macKey: "⌘U",
    windowsKey: "Ctrl+U",
  },
];

export const getShortcutsByCategory = () => {
  const categories = Array.from(new Set(shortcutsData.map(item => item.category)));
  return categories.reduce((acc, category) => {
    acc[category] = shortcutsData.filter(item => item.category === category);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);
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
