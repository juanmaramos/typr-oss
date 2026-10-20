import { STTProviderIcon } from "@/components/transcript/STTProviderIcon";
import { useModelPreferences } from "@/hooks/useModelPreferences";
import { getLanguageName } from "@/lib/language-labels";
import { transcriptionModelQueryOptions } from "@/lib/model-selection";
import { sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect } from "react";

import {
  getSttModelDescription,
  getSttModelLabel,
  getSttModelMetadata,
  getSttSupportedLanguages,
} from "@/components/transcript/constants/languageData";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { type SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { useModelState } from "../../../../hooks/useModelState";
import { WERPerformanceModal } from "../wer-modal";
import { SharedSTTProps } from "./shared";

interface STTViewProps extends SharedSTTProps {
  isWerModalOpen: boolean;
  setIsWerModalOpen: (open: boolean) => void;
}

type CloudSttApiKeys = {
  assemblyai: string;
};

export function STTView({
  sttModels,
  downloadingModels,
  handleModelDownload,
  handleShowFileLocation,
  isWerModalOpen,
  setIsWerModalOpen,
  supportsLocalModels,
}: STTViewProps) {
  useLingui();
  const capabilities = useQuery(sttCapabilitiesQueryOptions());
  const [expandedModel, setExpandedModel] = React.useState<string | null>(null);
  const [cloudSttApiKeys, setCloudSttApiKeys] = React.useState<CloudSttApiKeys>({
    assemblyai: "",
  });

  const { selectTranscription } = useModelPreferences();
  const currentSTTModel = useQuery(transcriptionModelQueryOptions());
  const selectedSTTModel = currentSTTModel.data ?? "";

  const cloudSttApiKeysQuery = useQuery({
    queryKey: ["cloud-stt-api-keys"],
    queryFn: async (): Promise<CloudSttApiKeys> => ({
      assemblyai: await connectorCommands.getAssemblyaiApiKey(),
    }),
  });

  useEffect(() => {
    if (cloudSttApiKeysQuery.data) {
      setCloudSttApiKeys(cloudSttApiKeysQuery.data);
    }
  }, [cloudSttApiKeysQuery.data]);

  const saveCloudSttApiKey = async (value: string) => {
    await connectorCommands.setAssemblyaiApiKey(value);
    await cloudSttApiKeysQuery.refetch();
  };

  const hasAssemblyAiApiKey = (cloudSttApiKeysQuery.data?.assemblyai ?? "").trim().length > 0;
  const isAssemblyAiSelected = selectedSTTModel === "assemblyai-universal"
    || selectedSTTModel === "AssemblyAIUniversal";

  const selectCloudModel = () => selectTranscription("assemblyai-universal");

  // ✅ Derive model download state directly from useModelState (same pattern as useModelDownload)
  const { getModel } = useModelState();

  const selectLocalModel = (modelKey: string) => selectTranscription(modelKey as SupportedSttModel);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <Trans>Transcription</Trans>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            <Trans>Choose a model to turn speech into text.</Trans>
          </p>
        </div>
        {supportsLocalModels && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleShowFileLocation("stt")}
            className="text-xs h-7 gap-1.5 text-muted-foreground shrink-0"
          >
            <i className="ri-folder-3-line text-sm" />
            <Trans>Open folder</Trans>
          </Button>
        )}
      </div>

      {/* Models List */}
      {supportsLocalModels && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <Trans>On-device</Trans>
          </p>
          <div className="space-y-2">
            {sttModels.filter(model => !model.hidden && !(model as any).isCloud).map((model) => {
              const isExpanded = expandedModel === model.key;
              const showLanguages = (getSttSupportedLanguages(model.key, capabilities.data)?.length ?? 0) > 1;
              const modelState = getModel(model.key);
              const isCloud = false;

              return (
                <div key={model.key}>
                  <div className="rounded-lg border border-border bg-background px-4 py-3">
                    {/* Main row */}
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                        <STTProviderIcon model={model.key} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {getSttModelLabel(model.key)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getSttModelMetadata(model.key)?.provider}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {getSttModelDescription(model.key, capabilities.data)}
                        </p>
                      </div>

                      {/* Right column: action + dots */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Action / Status */}
                        <div>
                          {isCloud
                            ? (
                              <span className="inline-flex items-center gap-1.5 text-ui-caption text-success">
                                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                                <Trans>Ready</Trans>
                              </span>
                            )
                            : modelState?.isDownloaded && selectedSTTModel === model.key
                            ? (
                              <span className="inline-flex items-center gap-1.5 text-ui-caption text-success">
                                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                                <Trans>Current</Trans>
                              </span>
                            )
                            : modelState?.isDownloaded
                            ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void selectLocalModel(model.key);
                                }}
                                className="text-xs h-7 gap-1.5"
                              >
                                <Trans>Use</Trans>
                              </Button>
                            )
                            : modelState?.isDownloading
                            ? (
                              <span className="inline-flex items-center gap-1.5 text-ui-caption text-muted-foreground">
                                <i className="ri-loader-4-line animate-spin text-sm" />
                                <Trans>Downloading…</Trans>
                              </span>
                            )
                            : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleModelDownload(model.key);
                                }}
                                className="text-xs h-7 gap-1.5"
                              >
                                <i className="ri-download-line text-sm" />
                                {model.size}
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Language toggle */}
                    {showLanguages && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedModel(isExpanded ? null : model.key);
                        }}
                        className="mt-2 ml-11 text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        {isExpanded
                          ? (
                            <>
                              <Trans>Hide languages</Trans>
                              <i className="ri-arrow-up-s-line text-sm" />
                            </>
                          )
                          : model.key === "AssemblyAIUniversal"
                          ? (
                            <>
                              <Trans>View supported languages</Trans>
                              <i className="ri-arrow-down-s-line text-sm" />
                            </>
                          )
                          : (
                            <>
                              <Trans>View supported languages</Trans>
                              <i className="ri-arrow-down-s-line text-sm" />
                            </>
                          )}
                      </button>
                    )}

                    {isExpanded && showLanguages && (
                      <SupportedSttLanguages model={model.key} capabilities={capabilities.data} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cloud Models */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          <Trans>Cloud</Trans>
        </p>
        <div className="space-y-2">
          {sttModels.filter(model => !model.hidden && !!(model as any).isCloud).map((model) => {
            const isExpanded = expandedModel === model.key;
            const showLanguages = (getSttSupportedLanguages(model.key, capabilities.data)?.length ?? 0) > 1;

            return (
              <div key={model.key}>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  {/* Main row */}
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                      <STTProviderIcon model={model.key} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {getSttModelLabel(model.key)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {getSttModelMetadata(model.key)?.provider}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {getSttModelDescription(model.key, capabilities.data)}
                      </p>
                    </div>

                    {/* Right column: action + dots */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div>
                        {!hasAssemblyAiApiKey
                          ? (
                            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-ui-caption font-medium text-primary">
                              <Trans>API key required</Trans>
                            </span>
                          )
                          : isAssemblyAiSelected
                          ? (
                            <span className="inline-flex items-center gap-1.5 text-ui-caption text-success">
                              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                              <Trans>Current</Trans>
                            </span>
                          )
                          : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void selectCloudModel();
                              }}
                              className="text-xs h-7 gap-1.5"
                            >
                              <Trans>Use</Trans>
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 ml-11 grid gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      <Trans>API key</Trans>
                    </label>
                    <Input
                      type="password"
                      value={cloudSttApiKeys.assemblyai}
                      placeholder="aai_..."
                      onChange={(event) => setCloudSttApiKeys((keys) => ({ ...keys, assemblyai: event.target.value }))}
                      onBlur={(event) => void saveCloudSttApiKey(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {hasAssemblyAiApiKey
                        ? <Trans>Key stored locally. Audio is sent directly to AssemblyAI.</Trans>
                        : <Trans>Add a key to use AssemblyAI cloud transcription.</Trans>}
                    </p>
                  </div>

                  {/* Language toggle */}
                  {showLanguages && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedModel(isExpanded ? null : model.key);
                      }}
                      className="mt-2 ml-11 text-xs text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1 transition-colors"
                    >
                      {isExpanded
                        ? (
                          <>
                            <Trans>Hide languages</Trans>
                            <i className="ri-arrow-up-s-line text-sm" />
                          </>
                        )
                        : model.key === "AssemblyAIUniversal"
                        ? (
                          <>
                            <Trans>View supported languages</Trans>
                            <i className="ri-arrow-down-s-line text-sm" />
                          </>
                        )
                        : (
                          <>
                            <Trans>View supported languages</Trans>
                            <i className="ri-arrow-down-s-line text-sm" />
                          </>
                        )}
                    </button>
                  )}

                  {isExpanded && showLanguages && (
                    <SupportedSttLanguages model={model.key} capabilities={capabilities.data} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WERPerformanceModal
        isOpen={isWerModalOpen}
        onClose={() => setIsWerModalOpen(false)}
      />
    </div>
  );
}

function SupportedSttLanguages(
  { model, capabilities }: { model: string; capabilities?: import("@typr/plugin-local-stt").ModelCapabilities[] },
) {
  const languages = getSttSupportedLanguages(model, capabilities);
  if (!languages?.length) {
    return null;
  }
  return (
    <div className="mt-3 pt-3 ml-11 border-t">
      <p className="text-xs text-muted-foreground leading-relaxed">{languages.map(getLanguageName).join(", ")}</p>
    </div>
  );
}
