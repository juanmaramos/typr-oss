import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { usePlatform } from "@/hooks/usePlatform";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localSttCommands } from "@typr/plugin-local-stt";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { useLingui } from "@lingui/react/macro";

import { type SupportedModel } from "@typr/plugin-local-stt";
import { LANGUAGE_OPTIONS, type LanguageOption } from "../constants/languageData";

export function useSTTModel() {
  const { t } = useLingui();
  const { userId } = useTypr();
  const { supportsLocalModels } = usePlatform();
  const queryClient = useQueryClient();
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption>("balanced");

  // Get actual model configuration from connector store (drives dropdown UI selection)
  const { data: connectorModel } = useQuery({
    queryKey: ["stt-model-connector"],
    queryFn: () => connectorCommands.getSttModel(),
  });

  // Also get local model for validation (local models only)
  const localModelQuery = useQuery({
    queryKey: ["stt-local-model"],
    queryFn: () => localSttCommands.getCurrentModel(),
  });

  const autoSelectCloudStt = useCallback(() => {
    debugLogFor("DEBUG_STT", "SttDebug", "no available local STT; auto-selecting cloud STT");
    connectorCommands.setSttModel("assemblyai-universal").then(() => {
      queryClient.invalidateQueries({ queryKey: ["stt-model-connector"] });
      setSelectedLanguage("assemblyai-universal");
    }).catch(console.error);
  }, [queryClient]);

  useEffect(() => {
    debugLogFor("DEBUG_STT", "SttDebug", "init", { connectorModel, backendModel: localModelQuery.data });

    if (connectorModel && connectorModel.trim() !== "") {
      // Find the UI option that matches the connector store value
      const option = LANGUAGE_OPTIONS.find(o =>
        o.key === connectorModel || ("modelKey" in o && o.modelKey === connectorModel)
      );

      if (option) {
        // Cloud model selected — use it directly
        if ("isCloud" in option && option.isCloud) {
          setSelectedLanguage(option.key);
          return;
        }

        // Local model selected — verify it's actually downloaded
        // If unavailable on this platform, auto-select cloud instead.
        if (!supportsLocalModels && "modelKey" in option) {
          localSttCommands.isModelDownloaded(option.modelKey as SupportedModel).then((downloaded) => {
            if (!downloaded) {
              autoSelectCloudStt();
            } else {
              setSelectedLanguage(option.key);
            }
          }).catch(() => {
            setSelectedLanguage(option.key);
          });
          return;
        }

        setSelectedLanguage(option.key);
      } else {
        console.warn("[STT_MODEL_INIT] ❌ No matching UI option found for connector model:", connectorModel);
        setSelectedLanguage("balanced");
      }
    } else {
      // No STT model configured — platforms without local models get cloud default.
      if (!supportsLocalModels) {
        autoSelectCloudStt();
        return;
      }
      setSelectedLanguage("balanced");
    }
  }, [connectorModel, localModelQuery.data, supportsLocalModels, autoSelectCloudStt]);

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

        // Check if model is downloaded
        const isDownloaded = await localSttCommands.isModelDownloaded(modelEnum as SupportedModel);
        if (!isDownloaded) {
          console.error("[STT_MODEL_CHANGE] ❌ Model not downloaded:", modelEnum);
          throw new Error(
            `${option?.label || language} model isn't downloaded yet.`,
          );
        }

        // Set the new model (writes enum name to connector store)
        debugLogFor("DEBUG_STT", "SttDebug", "writing local model to connector store", { modelEnum });
        await localSttCommands.setCurrentModel(modelEnum as SupportedModel);
        debugLogFor("DEBUG_STT", "SttDebug", "local model set successfully", { modelEnum });
        return { language, isCloud };
      }

      // For cloud models, write UI key directly to connector store (not an enum)
      debugLogFor("DEBUG_STT", "SttDebug", "writing cloud model key", { language });

      try {
        await connectorCommands.setSttModel(language);
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
      setSelectedLanguage(language);

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

      // Refetch connector store to ensure UI shows the selected model
      queryClient.invalidateQueries({ queryKey: ["stt-model-connector"] });

      // Also refetch local model for validation if it's a local model
      if (!isCloud) {
        await localModelQuery.refetch();
      }
    },
    onError: (error: Error) => {
      const isNotDownloaded = error.message.includes("downloaded");
      sonnerToast.error(error.message, {
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
    if (newLanguage === selectedLanguage) {
      return;
    }
    changeModelMutation.mutate(newLanguage);
  }, [selectedLanguage, changeModelMutation]);

  return {
    selectedLanguage,
    isChanging: changeModelMutation.isPending,
    error: changeModelMutation.error,
    handleLanguageChange,
    localModelQuery,
  };
}
