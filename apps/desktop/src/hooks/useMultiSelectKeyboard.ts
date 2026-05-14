import { useEffect } from "react";

import { useMultiSelectNotes } from "@/stores/useMultiSelectNotes";

interface UseMultiSelectKeyboardOptions {
  allVisibleNoteIds: string[];
  isActive?: boolean;
}

export function useMultiSelectKeyboard({
  allVisibleNoteIds,
  isActive = true,
}: UseMultiSelectKeyboardOptions) {
  const {
    clearSelection,
    selectAll,
    isMultiSelectMode,
  } = useMultiSelectNotes();

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
        || (event.target as Element)?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      switch (event.key) {
        case "Escape":
          if (isMultiSelectMode) {
            event.preventDefault();
            clearSelection();
          }
          break;

        case "a":
        case "A":
          if ((event.metaKey || event.ctrlKey) && allVisibleNoteIds.length > 0) {
            event.preventDefault();
            selectAll(allVisibleNoteIds);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    isActive,
    isMultiSelectMode,
    allVisibleNoteIds,
    clearSelection,
    selectAll,
  ]);
}
