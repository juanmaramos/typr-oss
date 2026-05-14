import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// Pure state - no business logic
interface MultiSelectState {
  selectedIds: string[]; // Use array instead of Set for serialization
  anchorId: string | null; // Last clicked item for range selection
  mode: "none" | "single" | "multi";
}

// Actions interface - clean separation
interface MultiSelectActions {
  // Core actions
  select: (id: string) => void;
  deselect: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;

  // Bulk actions
  selectRange: (fromId: string, toId: string, orderedIds: string[]) => void;
  selectAll: (ids: string[]) => void;

  // Query methods
  isSelected: (id: string) => boolean;
  getSelectedIds: () => string[];
  getCount: () => number;
  isActive: () => boolean;
}

type MultiSelectStore = MultiSelectState & MultiSelectActions;

export const useMultiSelect = create<MultiSelectStore>()(
  subscribeWithSelector((set, get) => ({
    // State
    selectedIds: [],
    anchorId: null,
    mode: "none",

    // Actions
    select: (id: string) =>
      set(state => {
        if (state.selectedIds.includes(id)) {
          return state;
        }

        return {
          selectedIds: [...state.selectedIds, id],
          anchorId: id,
          mode: state.selectedIds.length === 0 ? "single" : "multi",
        };
      }),

    deselect: (id: string) =>
      set(state => {
        const newSelectedIds = state.selectedIds.filter(selectedId => selectedId !== id);

        return {
          selectedIds: newSelectedIds,
          anchorId: newSelectedIds.length > 0 ? state.anchorId : null,
          mode: newSelectedIds.length === 0 ? "none" : newSelectedIds.length === 1 ? "single" : "multi",
        };
      }),

    toggle: (id: string) => {
      const { isSelected, select, deselect } = get();
      return isSelected(id) ? deselect(id) : select(id);
    },

    clear: () =>
      set({
        selectedIds: [],
        anchorId: null,
        mode: "none",
      }),

    selectRange: (fromId: string, toId: string, orderedIds: string[]) =>
      set(state => {
        const fromIndex = orderedIds.indexOf(fromId);
        const toIndex = orderedIds.indexOf(toId);

        if (fromIndex === -1 || toIndex === -1) {
          return state;
        }

        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        const rangeIds = orderedIds.slice(start, end + 1);

        // Merge with existing selection
        const newSelectedIds = [...new Set([...state.selectedIds, ...rangeIds])];

        return {
          selectedIds: newSelectedIds,
          anchorId: toId,
          mode: newSelectedIds.length > 1 ? "multi" : "single",
        };
      }),

    selectAll: (ids: string[]) =>
      set({
        selectedIds: [...ids],
        anchorId: ids[ids.length - 1] || null,
        mode: ids.length > 1 ? "multi" : ids.length === 1 ? "single" : "none",
      }),

    // Query methods
    isSelected: (id: string) => get().selectedIds.includes(id),
    getSelectedIds: () => get().selectedIds,
    getCount: () => get().selectedIds.length,
    isActive: () => get().mode !== "none",
  })),
);

// Business logic hooks - separate from state
export const useMultiSelectActions = () => {
  const store = useMultiSelect();

  const handleClick = (
    id: string,
    modifiers: { shift: boolean; ctrl: boolean },
    orderedIds: string[],
  ) => {
    if (modifiers.shift && store.anchorId) {
      store.selectRange(store.anchorId, id, orderedIds);
    } else if (modifiers.ctrl) {
      store.toggle(id);
    } else if (store.isActive()) {
      // In multi-select mode, regular click toggles
      store.toggle(id);
    } else {
      // Not in multi-select mode, regular click selects
      store.select(id);
    }
  };

  return { handleClick };
};

// Selector hooks for performance
export const useIsSelected = (id: string) => useMultiSelect(state => state.selectedIds.includes(id));
export const useSelectionCount = () => useMultiSelect(state => state.selectedIds.length);
export const useIsMultiSelectActive = () => useMultiSelect(state => state.mode !== "none");
