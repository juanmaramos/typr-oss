import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { MODEL_SELECTION_CHANGED_EVENT, refreshModelSelection } from "@/lib/model-selection";
import { safeUnlisten } from "@/utils/safe-unlisten";

/** Mount once per webview so native selection events share the same query cache. */
export function useModelSelectionSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const registrations = [MODEL_SELECTION_CHANGED_EVENT, "stt-model-selection-changed"].map(event =>
      listen(event, () => { void refreshModelSelection(queryClient); }).then(unlisten => {
        if (disposed) {
          safeUnlisten(unlisten, "model-selection.late-dispose");
        } else {
          unlisteners.push(unlisten);
        }
      }).catch(console.error)
    );
    // Re-read after registration to cover changes made while listeners started.
    void Promise.all(registrations).then(() => {
      if (!disposed) {
        void refreshModelSelection(queryClient);
      }
    });
    return () => {
      disposed = true;
      unlisteners.forEach(unlisten => safeUnlisten(unlisten, "model-selection"));
    };
  }, [queryClient]);
}
