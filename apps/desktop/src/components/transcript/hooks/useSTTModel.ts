import { useModelPreferences } from "@/hooks/useModelPreferences";
import { transcriptionModelQueryOptions, localTranscriptionModelQueryOptions } from "@/lib/model-selection";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { useLingui } from "@lingui/react/macro";

import { type SupportedModel } from "@typr/plugin-local-stt";
import { LANGUAGE_OPTIONS, sttModelMetadata, type LanguageOption } from "../constants/languageData";

export function useSTTModel() {
  const { t } = useLingui();
  const { userId } = useTypr();
  const { selectTranscription } = useModelPreferences();
  const { data: connectorModel } = useQuery(transcriptionModelQueryOptions());
  const localModelQuery = useQuery(localTranscriptionModelQueryOptions());
  const selectedLanguage: LanguageOption = LANGUAGE_OPTIONS.find(option =>
    option.key === connectorModel || option.modelKey === connectorModel
  )?.key ?? (connectorModel && sttModelMetadata[connectorModel]?.languageSupport === "english-only"
    ? "english"
    : "balanced");

  // Mutation to change STT model
  const changeModelMutation = useMutation({
    mutationFn: async (language: LanguageOption) => {
      debugLogFor("DEBUG_STT", "SttDebug", "user selected UI option", { language });
      const option = LANGUAGE_OPTIONS.find(o => o.key === language);
      const isCloud = (option && "isCloud" in option && option.isCloud) || false;
      const modelEnum = (option && "modelKey" in option) ? option.modelKey : language;
      debugLogFor("DEBUG_STT", "SttDebug", "model mapping", {
        uiKey: language,
        uiLabel: option?.label,
        modelEnum: modelEnum,
        isCloud: isCloud,
      });

      // Cloud models don't need download check
      if (!isCloud) {
        debugLogFor("DEBUG_STT", "SttDebug", "checking local model download", { modelEnum });

        // Set the new model (writes enum name to connector store)
        debugLogFor("DEBUG_STT", "SttDebug", "writing local model to connector store", { modelEnum });
        await selectTranscription(modelEnum as SupportedModel);
        debugLogFor("DEBUG_STT", "SttDebug", "local model set successfully", { modelEnum });
        return { language, isCloud };
      }

      // For cloud models, write UI key directly to connector store (not an enum)
      debugLogFor("DEBUG_STT", "SttDebug", "writing cloud model key", { language });

      try {
        await selectTranscription("assemblyai-universal");
        debugLogFor("DEBUG_STT", "SttDebug", "cloud model set successfully", { language });
      } catch (error) {
        console.error("[STT_MODEL_CHANGE] ❌ Failed to set cloud model:", error);
        throw error;
      }
      return { language, isCloud };
    },
    onSuccess: async ({ language, isCloud }) => {
      const option = LANGUAGE_OPTIONS.find(o => o.key === language);
      debugLogFor("DEBUG_STT", "SttDebug", "selection success; UI will show", {
        uiKey: language,
        uiLabel: option?.label,
        uiDescription: option?.description,
      });

      safeAnalyticsEvent({
        event: "stt_model_changed",
        distinct_id: userId,
        properties: {
          model: language,
          is_cloud: isCloud,
        },
      });

      sonnerToast.success(t`Transcription model changed`, {
        duration: 3000, // Auto-dismiss after 3 seconds
      });
    },
    onError: (error: Error) => {
      const isNotDownloaded = error.message.includes("downloaded");
      sonnerToast.error(isNotDownloaded ? t`Download a model first` : error.message, {
        duration: 5000,
        ...(isNotDownloaded && {
          action: {
            label: t`Download`,
            onClick: () => openSettingsWindow("/app/settings?tab=ai&section=transcription"),
          },
        }),
      });
    },
  });

  const handleLanguageChange = useCallback((newLanguage: LanguageOption) => {
    const option = LANGUAGE_OPTIONS.find(candidate => candidate.key === newLanguage);
    if (connectorModel === option?.key || connectorModel === option?.modelKey) {
      return;
    }
    changeModelMutation.mutate(newLanguage);
  }, [connectorModel, changeModelMutation]);

  return {
    selectedLanguage,
    isChanging: changeModelMutation.isPending,
    error: changeModelMutation.error,
    handleLanguageChange,
    localModelQuery,
  };
}
