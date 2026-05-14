import { toast } from "@typr/ui/components/ui/toast";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { isGroqModel } from "./useGroqModels";
import { useAllModels, useModelSelection } from "./useModels";

/**
 * Auto-switches to Groq cloud model when entering Edit mode
 * Shows toast notification if model was changed (not if already on Groq)
 *
 * Pattern: Similar to useSTTModel auto-switching logic
 */
export function useEditModeModelSwitch(editMode: "chat" | "edit") {
  const { allModels, selectedModel } = useAllModels();
  const { selectModel } = useModelSelection();
  const previousModeRef = useRef(editMode);

  useEffect(() => {
    // Only when switching TO Edit mode (not on mount, not when already in Edit)
    const switchedToEditMode = editMode === "edit" && previousModeRef.current === "chat";

    if (switchedToEditMode) {
      const currentlyOnGroq = selectedModel && isGroqModel(selectedModel.id);

      // Only switch if NOT already on Groq
      if (!currentlyOnGroq) {
        const groqModel = allModels.find(m => m.id === "groq-openai/gpt-oss-20b" && m.isAvailable);

        if (groqModel) {
          void selectModel(groqModel).then(() => {
            // Show toast (match existing toast API from editor-area/index.tsx)
            // Use JSX elements for title/content to support Trans component
            toast({
              id: "edit-mode-cloud-switch",
              title: <Trans>Switched to cloud model</Trans>,
              content: <Trans>Edit mode uses cloud models for better AI writing</Trans>,
              dismissible: true,
              duration: 4000,
            });
          }).catch((error) => {
            console.error("Failed to switch edit mode model:", error);
          });
        }
      }
    }

    // Update previous mode for next comparison
    previousModeRef.current = editMode;
  }, [editMode, selectedModel, allModels, selectModel]);
}
