import {
  getSttModelDescription,
  getSttModelLabel,
  SETTINGS_LOCAL_STT_MODEL_KEYS,
  sttModelMetadata,
} from "@/components/transcript/constants/languageData";
import { STTProviderIcon } from "@/components/transcript/STTProviderIcon";
import { useModelAvailabilityLabel } from "@/hooks/useModelAvailabilityLabel";
import { useModelPreferences } from "@/hooks/useModelPreferences";
import { useAllModels, useCustomModels, useModelSelection, useModelSelectionState } from "@/hooks/useModels";
import { usePlatform } from "@/hooks/usePlatform";
import { useTranscriptionAvailability } from "@/hooks/useTranscriptionAvailability";
import { aiTaskDefaultsQueryOptions, transcriptionModelQueryOptions } from "@/lib/model-selection";
import { getAvailableSettingsSttModels, sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { type ModelOption, ModelType } from "@/types/models";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { cn } from "@typr/ui/lib/utils";
import { type AiTaskDefaults, type AiTextTask, AUTO_CLOUD_MODEL_ID, normalizeAiTaskDefaults } from "@typr/utils";
import { useMemo } from "react";
import type { ReactNode } from "react";

const FOLLOW_CHAT_VALUE = "__follow_chat__";
const ASSEMBLYAI_STT_MODEL = "assemblyai-universal";

type TextTaskRow = {
  description: ReactNode;
  icon: string;
  keyName: keyof AiTaskDefaults;
  label: ReactNode;
  task: Exclude<AiTextTask, "chat">;
};

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

function isSettingsLocalSttModel(modelId: string): modelId is SupportedSttModel {
  return SETTINGS_LOCAL_STT_MODEL_KEYS.some(modelKey => modelKey === modelId);
}

export function AiTaskDefaultsSettings() {
  const { t } = useLingui();
  const { selectTranscription, setTaskDefault } = useModelPreferences();
  const { supportsLocalModels } = usePlatform();
  const { getAvailability, retry: retryTranscription } = useTranscriptionAvailability();
  const statusLabel = useModelAvailabilityLabel();
  const { allModels, selectedModel, isAutoMode, isLoading: allModelsLoading } = useAllModels();
  const { models: cloudModels, isLoading: cloudModelsLoading } = useCustomModels();
  const { selectModel } = useModelSelection();
  const { setAutoMode } = useModelSelectionState();

  const sttCapabilities = useQuery(sttCapabilitiesQueryOptions());
  const availableSttModels = getAvailableSettingsSttModels(sttCapabilities.data);
  const defaultsQuery = useQuery(aiTaskDefaultsQueryOptions());
  const sttModelQuery = useQuery(transcriptionModelQueryOptions());

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
    mutationFn: ({ task, model }: { task: keyof AiTaskDefaults; model: string | null }) => setTaskDefault(task, model),
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
    updateDefaultsMutation.mutate({ task: keyName, model: nextValue });
  };

  const updateTranscriptionDefault = async (value: string) => {
    if (!getAvailability(value).canSelect) {
      return;
    }
    if (value !== ASSEMBLYAI_STT_MODEL && !isSettingsLocalSttModel(value)) {
      return;
    }

    await selectTranscription(value as SupportedSttModel | "assemblyai-universal");
  };

  const cloudSttAvailability = getAvailability(ASSEMBLYAI_STT_MODEL);
  const hasSttError = [ASSEMBLYAI_STT_MODEL, ...availableSttModels].some(id => getAvailability(id).canRetry);
  const transcriptionValue = sttModelQuery.data ?? "";
  const chatModelLabel = chatModelValue === AUTO_CLOUD_MODEL_ID
    ? t`Auto`
    : getModelNameLabel(selectedModel ?? allModels.find(model => model.id === chatModelValue), chatModelValue);
  const transcriptionLabel = getSttModelLabel(transcriptionValue);

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="mb-5 min-w-0">
        <h2 className="text-base font-semibold text-foreground">
          <Trans>Defaults</Trans>
        </h2>
        <p className="mt-1 max-w-3xl text-base leading-7 text-muted-foreground">
          <Trans>
            Typr uses these AI models by default for chat, project briefs, meeting summaries, and transcription. You can
            override them later by choosing a different model inside each feature.
          </Trans>
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
                      icon={model.customIcon
                        || (model.type === ModelType.LOCAL ? "ri-hard-drive-3-line" : "ri-robot-line")}
                      label={getModelOptionLabel(model)}
                      description={model.availability && model.availability.status !== "ready"
                        ? statusLabel(model.availability)
                        : model.type === ModelType.LOCAL
                        ? t`On-device model`
                        : model.description}
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
                      disabled={!isSelectableModel(model)}
                      textValue={getModelOptionLabel(model)}
                    >
                      <ModelSelectLabel
                        icon={model.customIcon || "ri-robot-line"}
                        label={getModelOptionLabel(model)}
                        description={model.availability && !model.availability.canSelect
                          ? statusLabel(model.availability)
                          : model.description}
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
                <span className="flex items-center gap-2">
                  <STTProviderIcon model={transcriptionValue} />
                  <SelectTriggerLabel label={transcriptionLabel} />
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem
                value={ASSEMBLYAI_STT_MODEL}
                textValue={getSttModelLabel(ASSEMBLYAI_STT_MODEL)}
                disabled={!cloudSttAvailability.canSelect}
              >
                <ModelSelectLabel
                  icon={<STTProviderIcon model={ASSEMBLYAI_STT_MODEL} />}
                  label={getSttModelLabel(ASSEMBLYAI_STT_MODEL)}
                  description={cloudSttAvailability.canSelect
                    ? getSttModelDescription(ASSEMBLYAI_STT_MODEL)
                    : statusLabel(cloudSttAvailability)}
                />
              </SelectItem>
              {supportsLocalModels && availableSttModels.map((modelKey) => {
                const metadata = sttModelMetadata[modelKey];
                const availability = getAvailability(modelKey);
                const description = availability.canSelect && !availability.canRetry
                  ? getSttModelDescription(modelKey, sttCapabilities.data)
                  : statusLabel(availability);

                return (
                  <SelectItem
                    key={modelKey}
                    value={modelKey}
                    textValue={metadata.name}
                    disabled={!availability.canSelect}
                  >
                    <ModelSelectLabel
                      icon={<STTProviderIcon model={modelKey} />}
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

      {hasSttError && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void retryTranscription()}
          className="mt-3 h-7 text-xs"
        >
          <Trans>Retry</Trans>
        </Button>
      )}

      {(allModelsLoading || cloudModelsLoading) && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans>Loading available models...</Trans>
        </p>
      )}
    </section>
  );
}

function isSelectableModel(model: ModelOption) {
  return model.availability?.canSelect ?? false;
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
  icon: ReactNode;
  label: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {typeof icon === "string" ? <i className={cn("shrink-0 text-sm text-muted-foreground", icon)} /> : icon}
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
