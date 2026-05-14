import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

import { showModelDownloadStateToast } from "@/components/toast/shared";
import { sttModelMetadata } from "@/components/transcript/constants/languageData";
import { useModelState } from "@/hooks/useModelState";
import { commands } from "@/types";
import { commands as localLlmCommands, type SupportedModel as SupportedLlmModel } from "@typr/plugin-local-llm";
import { commands as localSttCommands, SupportedModel } from "@typr/plugin-local-stt";
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
  const { getModel } = useModelState();
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

        const [isSttDownloaded, isLlmDownloaded, isSttDownloading, isLlmDownloading] = await Promise.all([
          localSttCommands.isModelDownloaded(selectedSttModel),
          localLlmCommands.isModelDownloaded(selectedLlmModel),
          localSttCommands.isModelDownloading(selectedSttModel),
          localLlmCommands.isModelDownloading(selectedLlmModel),
        ]);

        if (!isSttDownloaded && !isSttDownloading) {
          await localSttCommands.downloadModelBackground(selectedSttModel);
        }

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
  }, [selectedLlmModel, selectedSttModel, retryAttempt]);

  const sttModelState = getModel(selectedSttModel);
  const llmModelState = getModel(selectedLlmModel);
  const sttCompleted = sttModelState?.isDownloaded || false;
  const llmCompleted = llmModelState?.isDownloaded || false;
  const sttError = sttModelState?.error;
  const llmError = llmModelState?.error;
  const sttProgress = sttCompleted ? 100 : sttModelState?.progress || 0;
  const llmProgress = llmCompleted ? 100 : llmModelState?.progress || 0;
  const bothCompleted = sttCompleted && llmCompleted;
  const hasErrors = !!sttError || !!llmError;
  const sttMetadata = sttModelMetadata[selectedSttModel];

  useEffect(() => {
    const handleSttCompletion = async () => {
      if (!sttCompleted || didSetupStt.current) {
        return;
      }

      didSetupStt.current = true;
      try {
        await localSttCommands.setCurrentModel(selectedSttModel);
        await localSttCommands.startServer();
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
        await localLlmCommands.setCurrentModel(selectedLlmModel);
        await localLlmCommands.startServer();
      } catch (error) {
        didSetupLlm.current = false;
        console.error("Error setting up LLM:", error);
      }
    };

    handleSttCompletion();
    handleLlmCompletion();
  }, [sttCompleted, llmCompleted, selectedLlmModel, selectedSttModel]);

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
      : t`One-time download, ${sttMetadata?.size || "250 MB"}`;

    if (sttError) {
      showModelDownloadStateToast({
        id: ONBOARDING_STT_TOAST_ID,
        status: "error",
        title: <Trans>Transcription setup failed</Trans>,
        description: sttDescription,
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
        description: sttDescription,
        progress: sttProgress,
      });
    }
  }, [
    retryDownloads,
    sttCompleted,
    sttError,
    sttProgress,
    sttMetadata?.size,
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
