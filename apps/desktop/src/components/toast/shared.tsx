import { Trans } from "@lingui/react/macro";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { DEFAULT_ONBOARDING_LLM_MODEL } from "@/components/welcome-modal/model-setup";
import { useModelState } from "@/hooks/useModelState";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { sttModelMetadata } from "@/components/transcript/constants/languageData";
import { commands as localLlmCommands, SupportedModel as SupportedModelLLM } from "@typr/plugin-local-llm";
import { commands as localSttCommands, SupportedModel } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { Progress } from "@typr/ui/components/ui/progress";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";

type ModelDownloadToastStatus = "loading" | "success" | "error";

function ModelDownloadStateToastContent({
  description,
  progress,
  status,
}: {
  description: ReactNode;
  progress?: number;
  status: ModelDownloadToastStatus;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm">{description}</div>

      {status === "loading" && typeof progress === "number" && (
        <div className="space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(progress)}%
          </div>
        </div>
      )}
    </div>
  );
}

function ModelDownloadDescription({
  detail,
  iconClass,
  modelName,
}: {
  detail: ReactNode;
  iconClass: string;
  modelName: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <i className={`${iconClass} text-base`} />
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{modelName}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function getFallbackLlmModelName(model: SupportedModelLLM): string {
  switch (model) {
    case "Gemma4E4b":
      return "Gemma 4";
    case "Qwen3_4bThinkingQ4Km":
      return "Qwen 3 Thinking";
    case "Phi4MiniQ4Km":
      return "Phi-4 Mini";
    case "Llama3p2_3bQ4":
      return "Llama 3.2";
    case "Gemma3_4b":
      return "Gemma 3";
    default:
      return model;
  }
}

export function showModelDownloadStateToast({
  id,
  status,
  title,
  description,
  progress,
  action,
}: {
  id: string;
  status: ModelDownloadToastStatus;
  title: ReactNode;
  description: ReactNode;
  progress?: number;
  action?: {
    label: ReactNode;
    onClick: () => void;
  };
}) {
  toast({
    id,
    title,
    content: (
      <ModelDownloadStateToastContent
        description={description}
        progress={progress}
        status={status}
      />
    ),
    buttons: action
      ? [
        {
          label: action.label,
          onClick: action.onClick,
          primary: true,
        },
      ]
      : [],
    dismissible: false,
  });
}

function SttModelDownloadToastContent({
  model,
  onComplete,
  queryClient,
  toastId,
}: {
  model: SupportedModel;
  onComplete?: () => void;
  queryClient?: QueryClient;
  toastId: string;
}) {
  const { getModel } = useModelState();
  const completedRef = useRef(false);
  const modelState = getModel(model);
  const progress = modelState?.isDownloaded ? 100 : modelState?.progress || 0;
  const error = modelState?.error;
  const metadata = sttModelMetadata[model];
  const modelName = metadata?.name ?? model;
  const modelSize = metadata?.size;
  const iconClass = metadata?.iconClass ?? "ri-speech-to-text-line";

  useEffect(() => {
    if (!modelState?.isDownloaded || completedRef.current) {
      return;
    }

    completedRef.current = true;
    void (async () => {
      sonnerToast.dismiss(toastId);
      await localSttCommands.setCurrentModel(model);
      await localSttCommands.startServer();

      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ["stt-model-downloading"] });
        queryClient.invalidateQueries({ queryKey: ["stt-language-selector-download-status"] });
        queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
      }

      onComplete?.();
    })().catch(console.error);
  }, [model, modelState?.isDownloaded, onComplete, queryClient, toastId]);

  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <Trans>Check your connection and retry.</Trans>
        </div>
        <Button
          variant="default"
          onClick={() => {
            localSttCommands.downloadModelBackground(model).catch(console.error);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  return (
    <ModelDownloadStateToastContent
      status="loading"
      description={
        <ModelDownloadDescription
          iconClass={iconClass}
          modelName={modelName}
          detail={modelSize
            ? <Trans>Voice transcription · {modelSize}</Trans>
            : <Trans>Voice transcription</Trans>}
        />
      }
      progress={progress}
    />
  );
}

function LlmModelDownloadToastContent({
  model,
  onComplete,
  queryClient,
  toastId,
}: {
  model: SupportedModelLLM;
  onComplete?: () => void;
  queryClient?: QueryClient;
  toastId: string;
}) {
  const { getModel } = useModelState();
  const completedRef = useRef(false);
  const modelState = getModel(model);
  const progress = modelState?.isDownloaded ? 100 : modelState?.progress || 0;
  const error = modelState?.error;
  const modelInfoQuery = useQuery({
    queryKey: ["llm-supported-models"],
    queryFn: () => localLlmCommands.listSupportedModels(),
    staleTime: 60 * 1000,
  });
  const modelInfo = modelInfoQuery.data?.find(info => info.id === model);
  const modelName = modelInfo?.name ?? getFallbackLlmModelName(model);
  const modelSize = modelInfo?.size;
  const iconClass = modelInfo?.icon ?? "ri-cpu-line";

  useEffect(() => {
    if (!modelState?.isDownloaded || completedRef.current) {
      return;
    }

    completedRef.current = true;
    void (async () => {
      sonnerToast.dismiss(toastId);
      await localLlmCommands.setCurrentModel(model);
      await localLlmCommands.startServer();

      if (queryClient) {
        queryClient.invalidateQueries({ queryKey: ["models"] });
        queryClient.invalidateQueries({ queryKey: ["models", "current"] });
        queryClient.invalidateQueries({ queryKey: ["cloud-model", "current"] });
        queryClient.invalidateQueries({ queryKey: ["llm-model-downloading"] });
        queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
      }

      onComplete?.();
    })().catch(console.error);
  }, [model, modelState?.isDownloaded, onComplete, queryClient, toastId]);

  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <Trans>Check your connection and retry.</Trans>
        </div>
        <Button
          variant="default"
          onClick={() => {
            localLlmCommands.downloadModelBackground(model).catch(console.error);
          }}
        >
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  return (
    <ModelDownloadStateToastContent
      status="loading"
      description={
        <ModelDownloadDescription
          iconClass={iconClass}
          modelName={modelName}
          detail={modelSize
            ? <Trans>Chat and meeting summaries · {modelSize}</Trans>
            : <Trans>Chat and meeting summaries</Trans>}
        />
      }
      progress={progress}
    />
  );
}

export const DownloadProgress = ({
  channel,
  onComplete,
  showPercentage = true,
}: {
  channel: Channel<number>;
  onComplete?: () => void;
  showPercentage?: boolean;
}) => {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    channel.onmessage = (v) => {
      if (v < 0) {
        setError(true);
        return;
      }

      if (v > progress) {
        setProgress(v);
      }

      if (v >= 100 && onComplete) {
        onComplete();
      }
    };
  }, [channel, onComplete, progress]);

  if (error) {
    return (
      <div className="w-full">
        <div className="text-destructive font-medium">
          <Trans>Download failed. Please try again.</Trans>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      <Progress value={progress} className="h-1.5" />
      {showPercentage && (
        <div className="text-xs text-right tabular-nums text-muted-foreground">{Math.round(progress)}%</div>
      )}
    </div>
  );
};

export function showSttModelDownloadToast(model: SupportedModel, onComplete?: () => void, queryClient?: QueryClient) {
  localSttCommands.downloadModelBackground(model).catch(console.error);

  // Invalidate React Query caches to prevent duplicate download toasts
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ["stt-model-downloading"] });
    queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
  }

  const id = `stt-model-download-${model}`;

  toast(
    {
      id,
      title: <Trans>Setting up transcription</Trans>,
      content: (
        <SttModelDownloadToastContent
          model={model}
          onComplete={onComplete}
          queryClient={queryClient}
          toastId={id}
        />
      ),
      dismissible: false,
    },
  );
}

export function showLlmModelDownloadToast(
  model?: SupportedModelLLM,
  onComplete?: () => void,
  queryClient?: QueryClient,
) {
  const modelToDownload = model || DEFAULT_ONBOARDING_LLM_MODEL;

  localLlmCommands.downloadModelBackground(modelToDownload).catch(console.error);

  // Invalidate React Query caches to prevent duplicate download toasts
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: ["llm-model-downloading"] });
    queryClient.invalidateQueries({ queryKey: ["check-model-downloaded"] });
  }

  const id = `llm-model-download-${modelToDownload}`;

  toast(
    {
      id,
      title: <Trans>Setting up AI assistant</Trans>,
      content: (
        <LlmModelDownloadToastContent
          model={modelToDownload}
          onComplete={onComplete}
          queryClient={queryClient}
          toastId={id}
        />
      ),
      dismissible: false,
    },
  );
}

export function enhanceFailedToast() {
  const id = "no-llm-connection";

  const handleClick = () => {
    openSettingsWindow("/app/settings?tab=ai&section=chat");
    sonnerToast.dismiss(id);
  };

  toast({
    id,
    title: <Trans>Failed to enhance meeting notes</Trans>,
    content: (
      <div className="space-y-1">
        <div>
          <Trans>Go to AI models settings to check the status.</Trans>
        </div>
        <Button variant="default" onClick={handleClick}>
          <Trans>Open Settings</Trans>
        </Button>
      </div>
    ),
    dismissible: true,
    duration: 3000,
  });
}

export function deviceChangedDuringRecordingToast(autoMode: boolean) {
  toast({
    id: "device-changed-during-recording",
    title: <Trans>New audio device detected</Trans>,
    content: (
      <div>
        {autoMode
          ? (
            <Trans>
              Switched to your new audio device. Transcription continues.
            </Trans>
          )
          : (
            <Trans>
              Your transcription continues — still using the selected audio device.
            </Trans>
          )}
      </div>
    ),
    dismissible: true,
    duration: 5000,
  });
}

export function recordingStartFailedToast() {
  const id = "recording-start-failed";

  const handleClick = () => {
    openSettingsWindow("/app/settings?tab=ai&section=transcription");
    sonnerToast.dismiss(id);
  };

  toast({
    id,
    title: <Trans>Failed to start recording</Trans>,
    content: (
      <div className="space-y-1">
        <div>
          <Trans>Recording could not be started. Check your audio settings.</Trans>
        </div>
        <Button variant="default" onClick={handleClick}>
          <Trans>Open Settings</Trans>
        </Button>
      </div>
    ),
    dismissible: true,
    duration: 5000,
  });
}
