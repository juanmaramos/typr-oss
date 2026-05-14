import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

import { debugLog } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { useMultiSelectNotes } from "@/stores/useMultiSelectNotes";
import { deleteSessionWithWelcomeDismissal } from "@/utils/delete-session";
import { removeSessionsFromCache } from "@/utils/session-cache";
import { commands as miscCommands } from "@typr/plugin-misc";

export function useBulkDelete() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { thankYouSessionId } = useTypr();

  // Get current note ID to check if it's being deleted
  const currentNoteId = (() => {
    try {
      const params = useParams({ from: "/app/note/$id", shouldThrow: false });
      return params?.id || null;
    } catch {
      return null; // Not on a note route
    }
  })();

  const {
    selectedNoteIds,
    getSelectedCount,
    clearSelection,
  } = useMultiSelectNotes();

  const bulkDeleteMutation = useMutation({
    mutationFn: async (noteIds: string[]) => {
      console.log("Deleting notes:", noteIds);
      debugLog("[BulkDelete] deleting", { noteIds, currentNoteId });

      // Delete sessions from database
      const dbResults = await Promise.allSettled(
        noteIds.map(id => deleteSessionWithWelcomeDismissal(id, thankYouSessionId)),
      );

      // Session folder cleanup is best-effort and should not block UX navigation.
      const folderResults = await Promise.allSettled(
        noteIds.map(id => miscCommands.deleteSessionFolder(id)),
      );

      const dbFailures = dbResults.filter(
        result => result.status === "rejected",
      );

      if (dbFailures.length > 0) {
        console.error("Failed to delete some sessions:", dbFailures);
        debugLog("[BulkDelete] DB delete failures", { dbFailures });
        throw new Error(`Failed to delete ${dbFailures.length} notes`);
      }

      const folderFailures = folderResults.filter(
        result => result.status === "rejected",
      );

      if (folderFailures.length > 0) {
        console.warn("Some session folders could not be deleted:", folderFailures);
        debugLog("[BulkDelete] folder delete failures", { folderFailures });
      }

      console.log("Successfully deleted all notes");
    },
    onSuccess: (_, deletedNoteIds) => {
      // Clear selection first
      clearSelection();
      debugLog("[BulkDelete] success", { deletedNoteIds, currentNoteId });

      // Check if current note was deleted - route to workspace fallback if so
      if (currentNoteId && deletedNoteIds.includes(currentNoteId)) {
        console.log("Current note was deleted, navigating to /app");
        navigate({ to: "/app" });
      }

      // Single optimistic cache update instead of N removeQueries + invalidate
      removeSessionsFromCache(queryClient, deletedNoteIds);

      console.log("Deletion completed successfully");
    },
    onError: (error) => {
      console.error("Bulk deletion failed:", error);
      debugLog("[BulkDelete] failed", { error });
    },
  });

  const handleBulkDelete = useCallback(async () => {
    const selectedCount = getSelectedCount();
    const selectedIds = Array.from(selectedNoteIds);

    console.log("Bulk delete triggered:", { selectedCount, selectedIds });

    if (selectedCount === 0) {
      console.log("No notes selected, skipping delete");
      return;
    }

    const confirmMessage = selectedCount === 1
      ? t`Are you sure you want to delete this note?`
      : t`Are you sure you want to delete ${selectedCount} notes?`;

    console.log("Showing confirmation dialog:", confirmMessage);

    try {
      const confirmed = await confirm(confirmMessage);
      console.log("User confirmation:", confirmed);

      if (confirmed) {
        bulkDeleteMutation.mutate(selectedIds);
      }
    } catch (error) {
      console.error("Confirmation dialog error:", error);
    }
  }, [selectedNoteIds, getSelectedCount, bulkDeleteMutation, t]);

  return {
    handleBulkDelete,
    isDeleting: bulkDeleteMutation.isPending,
    error: bulkDeleteMutation.error,
  };
}
