import { useCallback } from "react";

import { commands as localSttCommands, type SupportedModel } from "@typr/plugin-local-stt";
import { useModelState } from "../../../hooks/useModelState";
import { LANGUAGE_OPTIONS } from "../constants/languageData";

export interface ModelDownloadState {
  isDownloaded: boolean;
  isDownloading: boolean;
  error: string | null;
}

export function useModelDownload() {
  const { getModel, isLoading } = useModelState(); // Event-driven state

  // SAME INTERFACE - components don't change
  const getModelStatus = useCallback((languageKey: string): ModelDownloadState => {
    const option = LANGUAGE_OPTIONS.find(opt => opt.key === languageKey);
    if (!option) {
      return { isDownloaded: false, isDownloading: false, error: "Invalid model key" };
    }

    const modelState = getModel(option.modelKey);
    return {
      isDownloaded: modelState?.isDownloaded || false,
      isDownloading: modelState?.isDownloading || false,
      error: modelState?.error || null,
    };
  }, [getModel]);

  const downloadModel = useCallback(async (languageKey: string) => {
    const option = LANGUAGE_OPTIONS.find(opt => opt.key === languageKey);
    if (!option) {
      console.error("Invalid language key:", languageKey);
      return;
    }

    const modelKey = option.modelKey as SupportedModel;

    try {
      // Events handle progress and state updates. Selection changes after the model is available.
      await localSttCommands.downloadModelBackground(modelKey);
    } catch (error) {
      console.error("Download failed:", error);
    }
  }, []);

  return {
    getModelStatus, // SAME
    downloadModel, // SAME
    isLoading, // SAME
  };
}
