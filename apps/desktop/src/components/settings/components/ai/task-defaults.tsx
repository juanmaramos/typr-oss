import { SETTINGS_LOCAL_STT_MODEL_KEYS, sttModelMetadata } from "@/components/transcript/constants/languageData";
import { useModelState } from "@/hooks/useModelState";
import { useAllModels, useCustomModels, useModelSelection, useModelSelectionState } from "@/hooks/useModels";
import { usePlatform } from "@/hooks/usePlatform";
import { ModelType, type ModelOption } from "@/types/models";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localSttCommands, type SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { cn } from "@typr/ui/lib/utils";
import { AUTO_CLOUD_MODEL_ID, normalizeAiTaskDefaults, type AiTaskDefaults, type AiTextTask } from "@typr/utils";
import { useMemo } from "react";
import type { ReactNode } from "react";

const FOLLOW_CHAT_VALUE = "__follow_chat__";
const ASSEMBLYAI_STT_MODEL = "assemblyai-universal";
const DEFAULT_LOCAL_STT_MODEL = "QuantizedLargeTurbo";

type TextTaskRow = {
  description: ReactNode;
  icon: string;
  keyName: keyof AiTaskDefaults;
  label: ReactNode;
  task: Exclude<AiTextTask, "chat">;
};

const aiTaskDefaultsQueryKey = ["ai-task-defaults"] as const;
const sttModelQueryKey = ["stt-model-connector"] as const;
const cloudSttApiKeysQueryKey = ["cloud-stt-api-keys"] as const;

function getModelOptionLabel(model: ModelOption | null | undefined, fallback = "") {
  return model ? `${model.name}${model.vendor ? ` · ${model.vendor}` : ""}` : fallback;
}

function getModelNameLabel(model: ModelOption | null | undefined, fallback = "") {
  return model?.name ?? fallback;
}

function compactModelId(modelId: string) {
  return modelId.replace(/^openrouter-/, "").replace(/^openai-/, "").replace(/^groq-/, "");
}

function getTextTaskDefaultLabel({
  autoLabel,
  followLabel,
  model,
  value,
}: {
  autoLabel: string;
  followLabel: string;
  model: ModelOption | undefined;
  value: string;
}) {
  if (value === FOLLOW_CHAT_VALUE) {
    return followLabel;
  }

  if (value === AUTO_CLOUD_MODEL_ID) {
    return autoLabel;
  }

  return getModelNameLabel(model, compactModelId(value));
}

function getTranscriptionModelLabel(modelId: string) {
  if (modelId === ASSEMBLYAI_STT_MODEL) {
    return "AssemblyAI";
  }

  return sttModelMetadata[modelId as keyof typeof sttModelMetadata]?.name ?? modelId;
}

function isSettingsLocalSttModel(modelId: string): modelId is SupportedSttModel {
  return SETTINGS_LOCAL_STT_MODEL_KEYS.some(modelKey => modelKey === modelId);
}

export function AiTaskDefaultsSettings() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { supportsLocalModels } = usePlatform();
  const { getModel: getModelState, isLoading: modelStateLoading } = useModelState();
  const { allModels, selectedModel, isAutoMode, isLoading: allModelsLoading } = useAllModels();
  const { models: cloudModels, isLoading: cloudModelsLoading } = useCustomModels();
  const { selectModel } = useModelSelection();
  const { setAutoMode } = useModelSelectionState();

  const defaultsQuery = useQuery({
    queryKey: aiTaskDefaultsQueryKey,
    queryFn: () => connectorCommands.getAiTaskDefaults(),
  });
  const sttModelQuery = useQuery({
    queryKey: sttModelQueryKey,
    queryFn: () => connectorCommands.getSttModel(),
  });
  const cloudSttApiKeysQuery = useQuery({
    queryKey: cloudSttApiKeysQueryKey,
    queryFn: async () => ({
      assemblyai: await connectorCommands.getAssemblyaiApiKey(),
    }),
  });

  const defaults = normalizeAiTaskDefaults(defaultsQuery.data);
  const cloudModelsById = useMemo(() => new Map(cloudModels.map((model) => [model.id, model])), [cloudModels]);
  const chatModelValue = isAutoMode ? AUTO_CLOUD_MODEL_ID : selectedModel?.id ?? AUTO_CLOUD_MODEL_ID;
  const textTaskRows: TextTaskRow[] = [
    {
      task: "projectBrief",
      keyName: "project_brief_model_id",
      icon: "ri-file-ai-2-line",
      label: <Trans>Project briefs</Trans>,
      description: <Trans>Builds the project brief from included notes and files.</Trans>,
    },
    {
      task: "meetingSummary",
      keyName: "meeting_summary_model_id",
      icon: "ri-ai-generate-text",
      label: <Trans>Meeting summaries</Trans>,
      description: <Trans>Writes AI notes after recordings, uploads, and imported videos.</Trans>,
    },
  ];

  const updateDefaultsMutation = useMutation({
    mutationFn: (nextDefaults: AiTaskDefaults) => connectorCommands.setAiTaskDefaults(normalizeAiTaskDefaults(nextDefaults)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiTaskDefaultsQueryKey });
    },
  });

  const updateChatDefault = async (value: string) => {
    if (value === AUTO_CLOUD_MODEL_ID) {
      await setAutoMode();
      return;
    }

    const model = allModels.find((candidate) => candidate.id === value);
    if (!model || !isSelectableModel(model)) {
      return;
    }

    await selectModel(model);
  };

  const updateTextTaskDefault = (keyName: keyof AiTaskDefaults, value: string) => {
    const nextValue = value === FOLLOW_CHAT_VALUE ? null : value;
    updateDefaultsMutation.mutate({
      ...defaults,
      [keyName]: nextValue,
    });
  };

  const updateTranscriptionDefault = async (value: string) => {
    if (value === ASSEMBLYAI_STT_MODEL && !hasAssemblyAiApiKey) {
      return;
    }

    if (value !== ASSEMBLYAI_STT_MODEL) {
      if (!isSettingsLocalSttModel(value) || !getModelState(value)?.isDownloaded) {
        return;
      }

      await localSttCommands.setCurrentModel(value as SupportedSttModel);
    }

    await connectorCommands.setSttModel(value);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sttModelQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["stt-local-model"] }),
      queryClient.invalidateQueries({ queryKey: ["stt-model", "current"] }),
    ]);
  };

  const hasAssemblyAiApiKey = (cloudSttApiKeysQuery.data?.assemblyai ?? "").trim().length > 0;
  const downloadedLocalSttValue = useMemo(() => {
    if (modelStateLoading) {
      return undefined;
    }

    const orderedLocalModels: SupportedSttModel[] = [
      DEFAULT_LOCAL_STT_MODEL,
      ...SETTINGS_LOCAL_STT_MODEL_KEYS.filter(modelKey => modelKey !== DEFAULT_LOCAL_STT_MODEL),
    ];

    return orderedLocalModels.find(modelKey => getModelState(modelKey)?.isDownloaded);
  }, [getModelState, modelStateLoading]);
  const storedTranscriptionValue = sttModelQuery.data?.trim();
  const preferredTranscriptionValue = storedTranscriptionValue
    || (supportsLocalModels ? DEFAULT_LOCAL_STT_MODEL : ASSEMBLYAI_STT_MODEL);
  const preferredLocalModelState = isSettingsLocalSttModel(preferredTranscriptionValue)
    ? getModelState(preferredTranscriptionValue)
    : undefined;
  const transcriptionValue = (() => {
    if (preferredTranscriptionValue === ASSEMBLYAI_STT_MODEL) {
      if (!hasAssemblyAiApiKey && supportsLocalModels && downloadedLocalSttValue) {
        return downloadedLocalSttValue;
      }

      return preferredTranscriptionValue;
    }

    if (
      !modelStateLoading
      && supportsLocalModels
      && isSettingsLocalSttModel(preferredTranscriptionValue)
      && !preferredLocalModelState?.isDownloaded
      && downloadedLocalSttValue
    ) {
      return downloadedLocalSttValue;
    }

    return preferredTranscriptionValue;
  })();
  const chatModelLabel = chatModelValue === AUTO_CLOUD_MODEL_ID
    ? t`Auto`
    : getModelNameLabel(selectedModel ?? allModels.find(model => model.id === chatModelValue), chatModelValue);
  const transcriptionLabel = getTranscriptionModelLabel(transcriptionValue);

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-5 min-w-0">
        <h2 className="text-base font-semibold text-foreground">
          <Trans>Defaults</Trans>
        </h2>
        <p className="mt-1 max-w-3xl text-base leading-7 text-muted-foreground">
          <Trans>Typr uses these AI models by default for chat, project briefs, meeting summaries, and transcription. You can override them later by choosing a different model inside each feature.</Trans>
        </p>
      </div>

      <div className="divide-y divide-border/70">
        <DefaultRow
          icon="ri-chat-ai-line"
          label={<Trans>Chat and Ask</Trans>}
          description={<Trans>The model used when you ask questions or edit notes from chat.</Trans>}
        >
          <Select value={chatModelValue} onValueChange={(value) => void updateChatDefault(value)}>
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-72">
              <SelectValue placeholder={t`Select model`}>
                <SelectTriggerLabel label={chatModelLabel} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={AUTO_CLOUD_MODEL_ID} textValue={t`Auto`}>
                <ModelSelectLabel icon="ri-sparkling-fill" label={t`Auto`} description={t`Best available model`} />
              </SelectItem>
              {allModels
                .filter((model) => model.type === ModelType.CLOUD || model.type === ModelType.LOCAL)
                .map((model) => (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                    disabled={!isSelectableModel(model)}
                    textValue={getModelOptionLabel(model)}
                  >
                    <ModelSelectLabel
                      icon={model.customIcon || (model.type === ModelType.LOCAL ? "ri-hard-drive-3-line" : "ri-robot-line")}
                      label={getModelOptionLabel(model)}
                      description={model.type === ModelType.LOCAL ? t`On-device model` : model.description}
                    />
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </DefaultRow>

        {textTaskRows.map((row) => {
          const value = defaults[row.keyName] || FOLLOW_CHAT_VALUE;
          const selectedCloudModel = value === FOLLOW_CHAT_VALUE || value === AUTO_CLOUD_MODEL_ID
            ? undefined
            : cloudModelsById.get(value);
          const taskModelLabel = getTextTaskDefaultLabel({
            autoLabel: t`Auto`,
            followLabel: t`Follow Chat and Ask`,
            model: selectedCloudModel,
            value,
          });

          return (
            <DefaultRow key={row.task} icon={row.icon} label={row.label} description={row.description}>
              <Select
                value={value}
                onValueChange={(nextValue) => updateTextTaskDefault(row.keyName, nextValue)}
                disabled={defaultsQuery.isLoading || updateDefaultsMutation.isPending}
              >
                <SelectTrigger className="h-9 w-full rounded-lg sm:w-72">
                  <SelectValue placeholder={t`Select model`}>
                    <SelectTriggerLabel label={taskModelLabel} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={FOLLOW_CHAT_VALUE} textValue={t`Follow Chat and Ask`}>
                    <ModelSelectLabel
                      icon="ri-chat-ai-line"
                      label={t`Follow Chat and Ask`}
                      description={t`Uses the chat default above`}
                    />
                  </SelectItem>
                  <SelectItem value={AUTO_CLOUD_MODEL_ID} textValue={t`Auto`}>
                    <ModelSelectLabel icon="ri-sparkling-fill" label={t`Auto`} description={t`Best available model`} />
                  </SelectItem>
                  {cloudModels.map((model) => (
                    <SelectItem
                      key={model.id}
                      value={model.id}
                      disabled={!model.isAvailable}
                      textValue={getModelOptionLabel(model)}
                    >
                      <ModelSelectLabel
                        icon={model.customIcon || "ri-robot-line"}
                        label={getModelOptionLabel(model)}
                        description={model.isAvailable ? model.description : t`API key required`}
                      />
                    </SelectItem>
                  ))}
                  {selectedCloudModel === undefined && value !== FOLLOW_CHAT_VALUE && value !== AUTO_CLOUD_MODEL_ID && (
                    <SelectItem value={value} textValue={compactModelId(value)}>
                      <ModelSelectLabel
                        icon="ri-robot-line"
                        label={compactModelId(value)}
                        description={t`Saved model`}
                      />
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </DefaultRow>
          );
        })}

        <DefaultRow
          icon="ri-mic-ai-line"
          label={<Trans>Transcription</Trans>}
          description={<Trans>The speech-to-text model used when a recording or upload starts.</Trans>}
        >
          <Select value={transcriptionValue} onValueChange={(value) => void updateTranscriptionDefault(value)}>
            <SelectTrigger className="h-9 w-full rounded-lg sm:w-72">
              <SelectValue placeholder={t`Select model`}>
                <SelectTriggerLabel label={transcriptionLabel} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ASSEMBLYAI_STT_MODEL} textValue={t`AssemblyAI`} disabled={!hasAssemblyAiApiKey}>
                <ModelSelectLabel
                  icon="ri-flashlight-fill"
                  label={t`AssemblyAI`}
                  description={hasAssemblyAiApiKey ? t`Cloud transcription` : t`API key required`}
                />
              </SelectItem>
              {supportsLocalModels && SETTINGS_LOCAL_STT_MODEL_KEYS.map((modelKey) => {
                const metadata = sttModelMetadata[modelKey];
                const modelState = getModelState(modelKey);
                const isDownloading = Boolean(modelState?.isDownloading);
                const isDownloaded = Boolean(modelState?.isDownloaded);
                const isUnavailable = !modelStateLoading && !isDownloaded;
                const description = isDownloading
                  ? t`Downloading...`
                  : isUnavailable
                    ? t`Download in Transcription settings`
                    : metadata.languageSupport === "english-only"
                      ? t`On-device English`
                      : t`On-device multilingual`;

                return (
                  <SelectItem
                    key={modelKey}
                    value={modelKey}
                    textValue={metadata.name}
                    disabled={isDownloading || isUnavailable}
                  >
                    <ModelSelectLabel
                      icon={metadata.iconClass}
                      label={metadata.name}
                      description={description}
                    />
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </DefaultRow>
      </div>

      {(allModelsLoading || cloudModelsLoading) && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans>Loading available models...</Trans>
        </p>
      )}
    </section>
  );
}

function isSelectableModel(model: ModelOption) {
  if (model.type === ModelType.CLOUD) {
    return model.isAvailable;
  }

  return Boolean(model.isDownloaded);
}

function DefaultRow({
  children,
  description,
  icon,
  label,
}: {
  children: ReactNode;
  description: ReactNode;
  icon: string;
  label: ReactNode;
}) {
  return (
    <div className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <i className={cn("text-sm text-foreground", icon)} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ModelSelectLabel({
  description,
  icon,
  label,
}: {
  description?: ReactNode;
  icon: string;
  label: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <i className={cn("shrink-0 text-sm text-muted-foreground", icon)} />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description && (
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </span>
  );
}

function SelectTriggerLabel({ label }: { label: ReactNode }) {
  return (
    <span className="block min-w-0 truncate text-left">
      {label}
    </span>
  );
}
