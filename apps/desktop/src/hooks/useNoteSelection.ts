import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo } from "react";

import { useTypr } from "@/contexts";
import { useMultiSelect } from "@/stores/useMultiSelect";
import { deleteSessionWithWelcomeDismissal } from "@/utils/delete-session";
import { commands as miscCommands } from "@typr/plugin-misc";

// Custom hook for note-specific selection logic
export const useNoteSelection = (visibleNoteIds: string[]) => {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const multiSelect = useMultiSelect();
  const { thankYouSessionId } = useTypr();

  // Memoize ordered IDs to prevent unnecessary recalculations
  const orderedIds = useMemo(() => visibleNoteIds, [visibleNoteIds]);

  // Bulk delete mutation with proper error handling
  const bulkDeleteMutation = useMutation({
    mutationFn: async (noteIds: string[]) => {
      // Delete in parallel with proper error aggregation
      const deleteResults = await Promise.allSettled([
        ...noteIds.map(id => deleteSessionWithWelcomeDismissal(id, thankYouSessionId)),
      ]);

      const folderResults = await Promise.allSettled([
        ...noteIds.map(id => miscCommands.deleteSessionFolder(id)),
      ]);

      // Check for failures
      const failures = [...deleteResults, ...folderResults].filter(
        result => result.status === "rejected",
      );

      if (failures.length > 0) {
        throw new Error(`Failed to delete ${failures.length} items`);
      }

      return noteIds;
    },
    onSuccess: (deletedIds) => {
      // Clear selection
      multiSelect.clear();

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["sessions"] });

      // Show success feedback
      console.log(`Successfully deleted ${deletedIds.length} notes`);
    },
    onError: (error) => {
      console.error("Bulk delete failed:", error);
      // Could show error toast here
    },
  });

  // Handle bulk delete with confirmation
  const handleBulkDelete = useCallback(async () => {
    const selectedIds = multiSelect.getSelectedIds();
    const count = selectedIds.length;

    if (count === 0) {
      return;
    }

    const message = count === 1
      ? t`Are you sure you want to delete this note?`
      : t`Are you sure you want to delete ${count} notes?`;

    const confirmed = await confirm(message);
    if (confirmed) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  }, [multiSelect, bulkDeleteMutation, t]);

  // Keyboard handler
  const handleKeyboard = useCallback((event: KeyboardEvent) => {
    // Only handle if not in input fields
    const isInInput = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
      || (event.target as Element)?.getAttribute("contenteditable") === "true";

    if (isInInput || !multiSelect.isActive()) {
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        multiSelect.clear();
        break;

      case "Delete":
      case "Backspace":
        event.preventDefault();
        handleBulkDelete();
        break;

      case "a":
      case "A":
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          multiSelect.selectAll(orderedIds);
        }
        break;
    }
  }, [multiSelect, orderedIds, handleBulkDelete]);

  return {
    // State
    selectedIds: multiSelect.getSelectedIds(),
    selectedCount: multiSelect.getCount(),
    isActive: multiSelect.isActive(),
    isSelected: multiSelect.isSelected,

    // Actions
    handleClick: (id: string, event: React.MouseEvent) => {
      const modifiers = {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
      };

      // Use the business logic from the actions hook
      if (modifiers.shift && multiSelect.anchorId) {
        multiSelect.selectRange(multiSelect.anchorId, id, orderedIds);
      } else if (modifiers.ctrl) {
        multiSelect.toggle(id);
      } else if (multiSelect.isActive()) {
        multiSelect.toggle(id);
      } else {
        multiSelect.select(id);
      }
    },

    handleBulkDelete,
    handleKeyboard,

    // Mutations
    isDeleting: bulkDeleteMutation.isPending,
    deleteError: bulkDeleteMutation.error,
  };
};
