import { create } from "zustand";

interface MultiSelectNotesState {
  selectedNoteIds: Set<string>;
  isMultiSelectMode: boolean;

  toggleNote: (noteId: string) => void;
  selectAll: (noteIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (noteId: string) => boolean;
  getSelectedCount: () => number;
}

export const useMultiSelectNotes = create<MultiSelectNotesState>((set, get) => ({
  selectedNoteIds: new Set(),
  isMultiSelectMode: false,

  toggleNote: (noteId: string) => {
    const state = get();
    const next = new Set(state.selectedNoteIds);

    if (next.has(noteId)) {
      next.delete(noteId);
    } else {
      next.add(noteId);
    }

    set({
      selectedNoteIds: next,
      isMultiSelectMode: next.size > 0,
    });
  },

  selectAll: (noteIds: string[]) => {
    set({
      selectedNoteIds: new Set(noteIds),
      isMultiSelectMode: noteIds.length > 0,
    });
  },

  clearSelection: () => {
    set({
      selectedNoteIds: new Set(),
      isMultiSelectMode: false,
    });
  },

  isSelected: (noteId: string) => {
    return get().selectedNoteIds.has(noteId);
  },

  getSelectedCount: () => {
    return get().selectedNoteIds.size;
  },
}));
