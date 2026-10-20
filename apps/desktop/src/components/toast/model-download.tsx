import { cloudChatModelQueryOptions, customEndpointEnabledQueryOptions, transcriptionModelQueryOptions } from "@/lib/model-selection";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useModelState } from "../../hooks/useModelState";
import { usePlatform } from "../../hooks/usePlatform";
import { DEFAULT_LOCAL_STT_MODEL } from "../transcript/constants/languageData";
import { showLlmModelDownloadToast, showSttModelDownloadToast } from "./shared";

const TOAST_DISMISSAL_KEY = "model-download-toast-dismissed";

export default function ModelDownloadNotification() {
  const queryClient = useQueryClient();
  const { t } = useLingui();
  const { supportsLocalModels } = usePlatform();
  const [isDismissed, setIsDismissed] = useState(() => {
    return (
      localStorage.getItem(TOAST_DISMISSAL_KEY) === "true"
      || sessionStorage.getItem(TOAST_DISMISSAL_KEY) === "true"
    );
  });

  const selectedSttModelQuery = useQuery(transcriptionModelQueryOptions());
  const selectedCloudModelQuery = useQuery(cloudChatModelQueryOptions());
  const customEndpointQuery = useQuery(customEndpointEnabledQueryOptions());

  const { getModel } = useModelState();

  const hasSttModel = [
    "QuantizedTiny",
    "QuantizedTinyEn",
    "QuantizedBase",
    "QuantizedBaseEn",
    "QuantizedSmall",
    "QuantizedSmallEn",
    "QuantizedLargeTurbo",
    "DistilLargeV35En",
  ].some(modelId => getModel(modelId)?.isDownloaded);

  const hasLlmModel = ["Gemma4E4b", "Qwen3_4bThinkingQ4Km", "Phi4MiniQ4Km", "Llama3p2_3bQ4"].some(modelId =>
    getModel(modelId)?.isDownloaded
  );

  const isDownloading = [
    "QuantizedTiny",
    "QuantizedTinyEn",
    "QuantizedBase",
    "QuantizedBaseEn",
    "QuantizedSmall",
    "QuantizedSmallEn",
    "QuantizedLargeTurbo",
    "DistilLargeV35En",
    "Gemma4E4b",
    "Qwen3_4bThinkingQ4Km",
    "Phi4MiniQ4Km",
    "Llama3p2_3bQ4",
  ].some(modelId => getModel(modelId)?.isDownloading);

  const selectedSttModel = selectedSttModelQuery.data || "";
  const selectedCloudModel = selectedCloudModelQuery.data || "";
  const isUsingCloudStt = selectedSttModel.includes("assemblyai");
  const isUsingCloudLlm = selectedCloudModel.length > 0 || customEndpointQuery.data === true;
  const isSelectionLoading = selectedSttModelQuery.isLoading || selectedCloudModelQuery.isLoading
    || customEndpointQuery.isLoading;

  useEffect(() => {
    // On Windows, cloud models are always available - don't show download prompt
    if (!supportsLocalModels) {
      return;
    }

    if (hasSttModel && hasLlmModel) {
      sonnerToast.dismiss("model-download-needed");
      return;
    }

    if (isDownloading) {
      sonnerToast.dismiss("model-download-needed");
      return;
    }

    // Wait until we know if cloud models are being used to avoid showing a stale prompt.
    if (isSelectionLoading) {
      return;
    }

    if (isDismissed) {
      return;
    }

    const needsSttModel = !hasSttModel && !isUsingCloudStt;
    const needsLlmModel = !hasLlmModel && !isUsingCloudLlm;

    let title: string;
    let content: string;
    let buttonLabel: string;

    if (needsSttModel && needsLlmModel) {
      title = t`Download offline AI models`;
      content = t`Cloud mode is already available. Download these only to use transcription and summaries offline.`;
      buttonLabel = t`Download offline models`;
    } else if (needsSttModel) {
      title = t`Download offline transcription model`;
      content =
        t`Cloud transcription is already available. Download this model only if you want offline transcription.`;
      buttonLabel = t`Download offline model`;
    } else if (needsLlmModel) {
      title = t`Download offline summary model`;
      content = t`Cloud summaries are already available. Download this model only if you want offline summaries.`;
      buttonLabel = t`Download offline model`;
    } else {
      sonnerToast.dismiss("model-download-needed");
      return;
    }

    const handleDismiss = () => {
      setIsDismissed(true);
      localStorage.setItem(TOAST_DISMISSAL_KEY, "true");
      sessionStorage.setItem(TOAST_DISMISSAL_KEY, "true");
      sonnerToast.dismiss("model-download-needed");
    };

    toast({
      id: "model-download-needed",
      title,
      content,
      buttons: [
        {
          label: buttonLabel,
          onClick: () => {
            sonnerToast.dismiss("model-download-needed");

            if (needsSttModel) {
              showSttModelDownloadToast(DEFAULT_LOCAL_STT_MODEL, undefined, queryClient);
            }

            if (needsLlmModel) {
              showLlmModelDownloadToast("Gemma4E4b", undefined, queryClient);
            }
          },
          primary: true,
        },
        {
          label: t`Dismiss`,
          onClick: handleDismiss,
          primary: false,
        },
      ],
      dismissible: false,
    });
  }, [
    hasSttModel,
    hasLlmModel,
    isDownloading,
    isDismissed,
    isSelectionLoading,
    isUsingCloudStt,
    isUsingCloudLlm,
    supportsLocalModels,
    queryClient,
    t,
  ]);

  return null;
}
