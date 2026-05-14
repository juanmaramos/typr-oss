import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect } from "react";

import { sttModelMetadata, WER_PERFORMANCE_TIERS } from "@/components/transcript/constants/languageData";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localSttCommands, type SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { cn } from "@typr/ui/lib/utils";
import { useModelState } from "../../../../hooks/useModelState";
import { WERPerformanceModal } from "../wer-modal";
import { SharedSTTProps } from "./shared";

interface STTViewProps extends SharedSTTProps {
  isWerModalOpen: boolean;
  setIsWerModalOpen: (open: boolean) => void;
}

// AssemblyAI U3 Pro supported languages (real-time cloud transcription)
const ASSEMBLYAI_LANGUAGES = {
  multilingualSupport: {
    label: "Multilingual code-switching",
    description: "Dynamically switches between these languages in a single conversation",
    languages: [
      "English",
      "Spanish",
      "French",
      "German",
      "Italian",
      "Portuguese",
    ],
  },
  highAccuracy: {
    label: "High accuracy (≤10% error)",
    description: "Best performance languages",
    languages: [
      "English",
      "Spanish",
      "French",
      "German",
      "Indonesian",
      "Italian",
      "Japanese",
      "Dutch",
      "Polish",
      "Portuguese",
      "Russian",
      "Turkish",
      "Ukrainian",
      "Catalan",
    ],
  },
  goodAccuracy: {
    label: "Good accuracy (10-25% error)",
    description: "Reliable transcription quality",
    languages: [
      "Arabic",
      "Azerbaijani",
      "Bulgarian",
      "Bosnian",
      "Mandarin Chinese",
      "Czech",
      "Danish",
      "Greek",
      "Estonian",
      "Finnish",
      "Filipino",
      "Galician",
      "Hindi",
      "Croatian",
      "Hungarian",
      "Korean",
      "Macedonian",
      "Malay",
      "Norwegian",
      "Romanian",
      "Slovak",
      "Swedish",
      "Thai",
      "Urdu",
      "Vietnamese",
    ],
  },
} as const;

type CloudSttApiKeys = {
  assemblyai: string;
};

export function STTView({
  selectedSTTModel,
  setSelectedSTTModel,
  sttModels,
  setSttModels,
  downloadingModels,
  handleModelDownload,
  handleShowFileLocation,
  isWerModalOpen,
  setIsWerModalOpen,
  supportsLocalModels,
}: STTViewProps) {
  const [expandedModel, setExpandedModel] = React.useState<string | null>(null);
  const [cloudSttApiKeys, setCloudSttApiKeys] = React.useState<CloudSttApiKeys>({
    assemblyai: "",
  });

  // Get current selected STT model from connector store (stores enum names)
  const currentSTTModel = useQuery({
    queryKey: ["current-stt-model"],
    queryFn: async () => {
      const model = await connectorCommands.getSttModel();
      return model || "QuantizedLargeTurbo"; // Default to QuantizedLargeTurbo
    },
  });

  useEffect(() => {
    if (currentSTTModel.data) {
      setSelectedSTTModel(currentSTTModel.data);
    }
  }, [currentSTTModel.data, setSelectedSTTModel]);

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

  const selectCloudModel = async () => {
    setSelectedSTTModel("assemblyai-universal");
    await connectorCommands.setSttModel("assemblyai-universal");
    await currentSTTModel.refetch();
  };

  // ✅ Derive model download state directly from useModelState (same pattern as useModelDownload)
  const { getModel } = useModelState();

  const isMultilingual = (modelKey: string) => {
    const metadata = sttModelMetadata[modelKey as keyof typeof sttModelMetadata];

    return metadata?.languageSupport === "multilingual" || modelKey === "AssemblyAIUniversal";
  };

  const selectLocalModel = async (modelKey: string) => {
    setSelectedSTTModel(modelKey);
    await localSttCommands.setCurrentModel(modelKey as SupportedSttModel);
    await currentSTTModel.refetch();
  };

  const renderLocalModelDescription = (modelKey: string) => {
    switch (modelKey) {
      case "QuantizedBase":
        return <Trans>Small multilingual model for faster offline transcription</Trans>;
      case "QuantizedBaseEn":
        return <Trans>Small English-only model for faster offline transcription</Trans>;
      case "QuantizedSmall":
        return <Trans>Balanced multilingual model for everyday offline use</Trans>;
      case "QuantizedSmallEn":
        return <Trans>Balanced English-only model for everyday offline use</Trans>;
      case "DistilLargeV35En":
        return <Trans>Highest quality for English meetings</Trans>;
      case "QuantizedLargeTurbo":
      default:
        return <Trans>Recommended multilingual model for most meetings</Trans>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <Trans>Transcription</Trans>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            <Trans>Convert your meeting audio into written text in real-time</Trans>
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
              const showLanguages = isMultilingual(model.key);
              const modelState = getModel(model.key);
              const isCloud = false;

              const modelIcon = sttModelMetadata[model.key as keyof typeof sttModelMetadata]?.iconClass
                ?? "ri-wifi-off-line";

              return (
                <div key={model.key}>
                  <div className="rounded-lg border border-border bg-background px-4 py-3">
                    {/* Main row */}
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                        <i className={cn("text-base text-foreground", modelIcon)} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{model.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {renderLocalModelDescription(model.key)}
                        </p>
                      </div>

                      {/* Right column: action + dots */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Action / Status */}
                        <div>
                          {isCloud
                            ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                                <Trans>Ready</Trans>
                              </span>
                            )
                            : modelState?.isDownloaded && selectedSTTModel === model.key
                            ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
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
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
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

                        {/* Performance dots */}
                        <div className="flex flex-col gap-1 items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                              <Trans>Accuracy</Trans>
                            </span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3].map((step) => (
                                <div
                                  key={step}
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    model.accuracy >= step ? "bg-primary" : "bg-border",
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                              <Trans>Speed</Trans>
                            </span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3].map((step) => (
                                <div
                                  key={step}
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    model.speed >= step ? "bg-primary" : "bg-border",
                                  )}
                                />
                              ))}
                            </div>
                          </div>
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
                              <Trans>View 50+ supported languages</Trans>
                              <i className="ri-arrow-down-s-line text-sm" />
                            </>
                          )}
                      </button>
                    )}

                    {/* Expandable language support */}
                    {isExpanded && showLanguages && (
                      <div className="mt-3 pt-3 ml-11 border-t animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="text-xs font-medium text-foreground mb-3">
                          {model.key === "AssemblyAIUniversal"
                            ? <Trans>Languages & features</Trans>
                            : <Trans>Supported languages by performance</Trans>}
                        </div>
                        <div className="space-y-3">
                          {model.key === "AssemblyAIUniversal"
                            ? (
                              <>
                                {Object.entries(ASSEMBLYAI_LANGUAGES).map(([key, data]) => (
                                  <div key={key} className="space-y-1">
                                    <div className="flex items-start gap-2">
                                      <div
                                        className={cn(
                                          "w-2 h-2 rounded-full mt-1 flex-shrink-0",
                                          key === "multilingualSupport"
                                            ? "bg-success"
                                            : key === "highAccuracy"
                                            ? "bg-info"
                                            : "bg-warning",
                                        )}
                                      />
                                      <div className="flex-1">
                                        <span className="text-xs font-medium text-foreground block">
                                          {key === "multilingualSupport"
                                            ? <Trans>Multilingual code-switching</Trans>
                                            : key === "highAccuracy"
                                            ? <Trans>High accuracy (≤10% error)</Trans>
                                            : <Trans>Good accuracy (10-25% error)</Trans>}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground block mb-1">
                                          {key === "multilingualSupport"
                                            ? (
                                              <Trans>
                                                Dynamically switches between these languages in a single conversation
                                              </Trans>
                                            )
                                            : key === "highAccuracy"
                                            ? <Trans>Best performance languages</Trans>
                                            : <Trans>Reliable transcription quality</Trans>}
                                        </span>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                          {data.languages.join(", ")}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <div className="pt-2 mt-2 border-t border-border/50">
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    <Trans>
                                      Plus 50+ additional languages with moderate to fair accuracy. Total 99 languages
                                      supported.
                                    </Trans>
                                  </p>
                                </div>
                              </>
                            )
                            : Object.entries(WER_PERFORMANCE_TIERS).map(([tier, data]) => (
                              <div key={tier} className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={cn(
                                      "w-2 h-2 rounded-full",
                                      tier === "excellent"
                                        ? "bg-success"
                                        : tier === "good"
                                        ? "bg-info"
                                        : tier === "moderate"
                                        ? "bg-warning"
                                        : tier === "weak"
                                        ? "bg-warning/70"
                                        : "bg-destructive/60",
                                    )}
                                  />
                                  <span className="text-xs font-medium text-foreground">
                                    {tier === "excellent"
                                      ? <Trans>Excellent</Trans>
                                      : tier === "good"
                                      ? <Trans>Good</Trans>
                                      : tier === "moderate"
                                      ? <Trans>Moderate</Trans>
                                      : tier === "weak"
                                      ? <Trans>Fair</Trans>
                                      : <Trans>Limited</Trans>}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({data.range})
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground pl-4 leading-relaxed">
                                  {data.languages.join(", ")}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
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
            const showLanguages = isMultilingual(model.key);

            const modelIcon = model.key === "AssemblyAIUniversal" ? "ri-flashlight-fill" : "ri-cloud-line";

            return (
              <div key={model.key}>
                <div className="rounded-lg border border-border bg-background px-4 py-3">
                  {/* Main row */}
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                      <i className={cn("text-base text-foreground", modelIcon)} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          <Trans>AssemblyAI</Trans>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        <Trans>Cloud transcription using your AssemblyAI API key</Trans>
                      </p>
                    </div>

                    {/* Right column: action + dots */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div>
                        {!hasAssemblyAiApiKey
                          ? (
                            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                              <Trans>API key required</Trans>
                            </span>
                          )
                          : isAssemblyAiSelected
                          ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
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

                      {/* Performance dots */}
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                            <Trans>Accuracy</Trans>
                          </span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  model.accuracy >= step ? "bg-primary" : "bg-border",
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                            <Trans>Speed</Trans>
                          </span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  model.speed >= step ? "bg-primary" : "bg-border",
                                )}
                              />
                            ))}
                          </div>
                        </div>
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

                  <div className="mt-3 ml-11">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {model.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {model.key === "AssemblyAIUniversal"
                            ? <Trans>Auto language detection and switching</Trans>
                            : <Trans>Cloud-based transcription</Trans>}
                        </p>
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

                  {/* Expandable language support */}
                  {isExpanded && showLanguages && (
                    <div className="mt-3 pt-3 ml-11 border-t animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="text-xs font-medium text-foreground mb-3">
                        {model.key === "AssemblyAIUniversal"
                          ? <Trans>Languages & features</Trans>
                          : <Trans>Supported languages</Trans>}
                      </div>
                      <div className="space-y-3">
                        {model.key === "AssemblyAIUniversal"
                          ? (
                            <>
                              {Object.entries(ASSEMBLYAI_LANGUAGES).map(([key, data]) => (
                                <div key={key} className="space-y-1">
                                  <div className="flex items-start gap-2">
                                    <div
                                      className={cn(
                                        "w-2 h-2 rounded-full mt-1 flex-shrink-0",
                                        key === "multilingualSupport"
                                          ? "bg-success"
                                          : key === "highAccuracy"
                                          ? "bg-info"
                                          : "bg-warning",
                                      )}
                                    />
                                    <div className="flex-1">
                                      <span className="text-xs font-medium text-foreground block">
                                        {key === "multilingualSupport"
                                          ? <Trans>Multilingual code-switching</Trans>
                                          : key === "highAccuracy"
                                          ? <Trans>High accuracy (≤10% error)</Trans>
                                          : <Trans>Good accuracy (10-25% error)</Trans>}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground block mb-1">
                                        {key === "multilingualSupport"
                                          ? (
                                            <Trans>
                                              Dynamically switches between these languages in a single conversation
                                            </Trans>
                                          )
                                          : key === "highAccuracy"
                                          ? <Trans>Best performance languages</Trans>
                                          : <Trans>Reliable transcription quality</Trans>}
                                      </span>
                                      <p className="text-xs text-muted-foreground leading-relaxed">
                                        {data.languages.join(", ")}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <div className="pt-2 mt-2 border-t border-border/50">
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  <Trans>
                                    Plus 50+ additional languages with moderate to fair accuracy. Total 99 languages
                                    supported.
                                  </Trans>
                                </p>
                              </div>
                            </>
                          )
                          : null}
                      </div>
                    </div>
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
