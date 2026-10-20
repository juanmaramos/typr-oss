import { STTProviderIcon } from "@/components/transcript/STTProviderIcon";
import { useModelPreferences } from "@/hooks/useModelPreferences";
import { useTranscriptionSetup } from "@/hooks/useTranscriptionSetup";
import { formatModelSize } from "@/lib/model-metadata";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

import { showModelDownloadStateToast } from "@/components/toast/shared";
import { getSttModelLabel } from "@/components/transcript/constants/languageData";
import { useModelState } from "@/hooks/useModelState";
import { commands } from "@/types";
import { commands as localLlmCommands, type SupportedModel as SupportedLlmModel } from "@typr/plugin-local-llm";
import { type SupportedModel } from "@typr/plugin-local-stt";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { createOnboardingModelSetup } from "./model-setup";

interface DownloadProgressViewProps {
  selectedSttModel: SupportedModel;
  selectedLlmModel: SupportedLlmModel;
  onContinue: () => void | Promise<void>;
}

const ONBOARDING_STT_TOAST_ID = "onboarding-stt-model-setup";
const ONBOARDING_LLM_TOAST_ID = "onboarding-llm-model-setup";
const ONBOARDING_COMPLETE_TOAST_ID = "onboarding-model-setup-complete";

export const DownloadProgressView = ({
  selectedSttModel,
  selectedLlmModel,
  onContinue,
}: DownloadProgressViewProps) => {
  const { t } = useLingui();
  const modelPreferences = useModelPreferences();
  const { getModel } = useModelState();
  const sttSetup = useTranscriptionSetup(selectedSttModel);
  const didStartDownloads = useRef(false);
  const didSetupStt = useRef(false);
  const didSetupLlm = useRef(false);
  const didPersistComplete = useRef(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (didStartDownloads.current) {
      return;
    }

    didStartDownloads.current = true;

    const startDownloads = async () => {
      try {
        await commands.setOnboardingModelSetup(createOnboardingModelSetup("downloading", null, {
          sttModel: selectedSttModel,
          llmModel: selectedLlmModel,
        }));

        const [isLlmDownloaded, isLlmDownloading] = await Promise.all([
          localLlmCommands.isModelDownloaded(selectedLlmModel),
          localLlmCommands.isModelDownloading(selectedLlmModel),
        ]);

        await modelPreferences.downloadTranscription(selectedSttModel);

        if (!isLlmDownloaded && !isLlmDownloading) {
          await localLlmCommands.downloadModelBackground(selectedLlmModel);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await commands.setOnboardingModelSetup(createOnboardingModelSetup("failed", message, {
          sttModel: selectedSttModel,
          llmModel: selectedLlmModel,
        })).catch(console.error);
      }
    };

    startDownloads();
  }, [selectedLlmModel, selectedSttModel, retryAttempt, modelPreferences]);

  const llmModelState = getModel(selectedLlmModel);
  const sttCompleted = sttSetup.completed;
  const llmCompleted = llmModelState?.isDownloaded || false;
  const sttError = sttSetup.error;
  const llmError = llmModelState?.error;
  const sttProgress = sttSetup.progress;
  const llmProgress = llmCompleted ? 100 : llmModelState?.progress || 0;
  const bothCompleted = sttCompleted && llmCompleted;
  const hasErrors = !!sttError || !!llmError;
  const sttSize = formatModelSize(sttSetup.sizeBytes);

  useEffect(() => {
    const handleSttCompletion = async () => {
      if (!sttCompleted || didSetupStt.current) {
        return;
      }

      didSetupStt.current = true;
      try {
        await modelPreferences.completeTranscriptionDownload(selectedSttModel);
      } catch (error) {
        didSetupStt.current = false;
        console.error("Error setting up STT:", error);
      }
    };

    const handleLlmCompletion = async () => {
      if (!llmCompleted || didSetupLlm.current) {
        return;
      }

      didSetupLlm.current = true;
      try {
        await modelPreferences.completeChatDownload(selectedLlmModel);
      } catch (error) {
        didSetupLlm.current = false;
        console.error("Error setting up LLM:", error);
      }
    };

    handleSttCompletion();
    handleLlmCompletion();
  }, [sttCompleted, llmCompleted, selectedLlmModel, selectedSttModel, modelPreferences]);

  useEffect(() => {
    if (!bothCompleted || didPersistComplete.current) {
      return;
    }

    didPersistComplete.current = true;
    commands.setOnboardingModelSetup(createOnboardingModelSetup("complete", null, {
      sttModel: selectedSttModel,
      llmModel: selectedLlmModel,
    })).catch((error) => {
      didPersistComplete.current = false;
      console.error("[Onboarding] Failed to persist completed model setup:", error);
    });
  }, [bothCompleted, selectedLlmModel, selectedSttModel]);

  const retryDownloads = useCallback(() => {
    didStartDownloads.current = false;
    setRetryAttempt(prev => prev + 1);
  }, []);

  useEffect(() => {
    const sttDescription = sttCompleted
      ? t`Ready`
      : sttError
      ? t`Check your connection and retry.`
      : sttSetup.sizeBytes > 0
      ? t`One-time download, ${sttSize}`
      : t`Preparing transcription`;

    if (sttError) {
      showModelDownloadStateToast({
        id: ONBOARDING_STT_TOAST_ID,
        status: "error",
        title: <Trans>Transcription setup failed</Trans>,
        description: (
          <span className="flex items-start gap-2">
            <STTProviderIcon model={selectedSttModel} />
            <span>
              <span className="block">{getSttModelLabel(selectedSttModel)}</span>
              {sttDescription}
            </span>
          </span>
        ),
        action: {
          label: <Trans>Retry</Trans>,
          onClick: retryDownloads,
        },
      });
    } else if (sttCompleted) {
      sonnerToast.dismiss(ONBOARDING_STT_TOAST_ID);
    } else {
      showModelDownloadStateToast({
        id: ONBOARDING_STT_TOAST_ID,
        status: "loading",
        title: <Trans>Preparing transcription</Trans>,
        description: (
          <span className="flex items-start gap-2">
            <STTProviderIcon model={selectedSttModel} />
            <span>
              <span className="block">{getSttModelLabel(selectedSttModel)}</span>
              {sttDescription}
            </span>
          </span>
        ),
        progress: sttProgress,
      });
    }
  }, [
    retryDownloads,
    sttCompleted,
    sttError,
    sttProgress,
    sttSize,
    sttSetup.sizeBytes,
    t,
  ]);

  useEffect(() => {
    const llmDescription = llmCompleted
      ? t`Ready`
      : llmError
      ? t`Check your connection and retry.`
      : t`One-time download, 5.0 GB`;

    if (llmError) {
      showModelDownloadStateToast({
        id: ONBOARDING_LLM_TOAST_ID,
        status: "error",
        title: <Trans>AI writing setup failed</Trans>,
        description: llmDescription,
        action: {
          label: <Trans>Retry</Trans>,
          onClick: retryDownloads,
        },
      });
    } else if (llmCompleted) {
      sonnerToast.dismiss(ONBOARDING_LLM_TOAST_ID);
    } else {
      showModelDownloadStateToast({
        id: ONBOARDING_LLM_TOAST_ID,
        status: "loading",
        title: <Trans>Preparing AI writing</Trans>,
        description: llmDescription,
        progress: llmProgress,
      });
    }
  }, [
    llmCompleted,
    llmError,
    llmProgress,
    retryDownloads,
    t,
  ]);

  useEffect(() => {
    if (!bothCompleted || hasErrors) {
      sonnerToast.dismiss(ONBOARDING_COMPLETE_TOAST_ID);
      return;
    }

    sonnerToast.dismiss(ONBOARDING_STT_TOAST_ID);
    sonnerToast.dismiss(ONBOARDING_LLM_TOAST_ID);
    showModelDownloadStateToast({
      id: ONBOARDING_COMPLETE_TOAST_ID,
      status: "success",
      title: <Trans>AI models are ready</Trans>,
      description: t`Transcription and AI writing are ready to use.`,
      action: {
        label: <Trans>Finish setup</Trans>,
        onClick: () => {
          sonnerToast.dismiss(ONBOARDING_COMPLETE_TOAST_ID);
          onContinue();
        },
      },
    });
  }, [
    bothCompleted,
    hasErrors,
    onContinue,
    t,
  ]);

  useEffect(() => {
    return () => {
      sonnerToast.dismiss(ONBOARDING_STT_TOAST_ID);
      sonnerToast.dismiss(ONBOARDING_LLM_TOAST_ID);
      sonnerToast.dismiss(ONBOARDING_COMPLETE_TOAST_ID);
    };
  }, []);

  return null;
};
