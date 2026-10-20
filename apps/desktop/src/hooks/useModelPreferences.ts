import { useQueryClient } from "@tanstack/react-query";
import { getModelSelectionController } from "@/lib/model-selection";

export function useModelPreferences() {
  return getModelSelectionController(useQueryClient());
}
