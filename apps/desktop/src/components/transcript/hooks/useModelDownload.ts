import { useModelPreferences } from "@/hooks/useModelPreferences";
import { useCallback } from "react";

import { useTranscriptionAvailability } from "@/hooks/useTranscriptionAvailability";
import { type SupportedModel } from "@typr/plugin-local-stt";
import { LANGUAGE_OPTIONS } from "../constants/languageData";

/** UI option names map to native IDs; the shared policy owns all action gates. */
export function useModelDownload() {
  const preferences = useModelPreferences();
  const { getAvailability, retry } = useTranscriptionAvailability();

  const getModelAvailability = useCallback((languageKey: string) => {
    const option = LANGUAGE_OPTIONS.find(option => option.key === languageKey || option.modelKey === languageKey);
    return getAvailability(option?.modelKey ?? languageKey);
  }, [getAvailability]);

  const downloadModel = useCallback(async (languageKey: string) => {
    const option = LANGUAGE_OPTIONS.find(option => option.key === languageKey || option.modelKey === languageKey);
    if (!option?.isLocal || !getAvailability(option.modelKey).canDownload) {
      return;
    }
    try {
      await preferences.downloadTranscription(option.modelKey as SupportedModel);
    } catch (error) {
      console.error("Download failed:", error);
      await retry();
    }
  }, [getAvailability, retry, preferences]);

  return { getModelAvailability, downloadModel, retry };
}
