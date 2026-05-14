import { useModelRegistry } from "@/hooks/useModelRegistry";
import { useCustomModels, useModelSelection } from "@/hooks/useModels";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";

import {
  CloudProviderId,
  getCloudProviderIcon,
  getCloudProviderIdFromModelId,
  getCloudProviderLabel,
} from "@/hooks/cloud-model-catalog";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localLlmCommands } from "@typr/plugin-local-llm";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { cn } from "@typr/ui/lib/utils";
import { SharedLLMProps } from "./shared";

type CloudApiKeys = {
  openai: string;
  groq: string;
  openrouter: string;
};

export function LLMLocalView({
  customLLMEnabled,
  setSelectedLLMModel,
  downloadingModels,
  handleModelDownload,
  handleShowFileLocation,
  supportsLocalModels,
}: SharedLLMProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { models, isLoading } = useModelRegistry();
  const { models: cloudModels, isLoading: cloudModelsLoading } = useCustomModels();
  const { selectModel } = useModelSelection();
  const cloudApiKeyInputId = useId();
  const [cloudApiKeys, setCloudApiKeys] = useState<CloudApiKeys>({
    openai: "",
    groq: "",
    openrouter: "",
  });
  const [expandedCloudProvider, setExpandedCloudProvider] = useState<CloudProviderId | null>(null);
  const [modelSearch, setModelSearch] = useState("");

  const currentLLMModel = useQuery({
    queryKey: ["current-llm-model"],
    queryFn: () => localLlmCommands.getCurrentModel(),
  });

  useEffect(() => {
    if (currentLLMModel.data && !customLLMEnabled.data) {
      setSelectedLLMModel(currentLLMModel.data);
    }
  }, [currentLLMModel.data, customLLMEnabled.data, setSelectedLLMModel]);

  const cloudApiKeysQuery = useQuery({
    queryKey: ["cloud-api-keys"],
    queryFn: async (): Promise<CloudApiKeys> => ({
      openai: await connectorCommands.getOpenaiApiKey(),
      groq: await connectorCommands.getGroqApiKey(),
      openrouter: await connectorCommands.getOpenrouterApiKey(),
    }),
  });

  useEffect(() => {
    if (cloudApiKeysQuery.data) {
      setCloudApiKeys(cloudApiKeysQuery.data);
    }
  }, [cloudApiKeysQuery.data]);

  const saveCloudApiKey = async (provider: keyof CloudApiKeys, value: string) => {
    if (provider === "openai") {
      await connectorCommands.setOpenaiApiKey(value);
    } else if (provider === "groq") {
      await connectorCommands.setGroqApiKey(value);
    } else {
      await connectorCommands.setOpenrouterApiKey(value);
    }

    queryClient.invalidateQueries({ queryKey: ["cloud-api-keys"] });
    queryClient.invalidateQueries({ queryKey: ["cloud-provider-models"] });
    queryClient.invalidateQueries({ queryKey: ["models"] });
  };

  const getCloudApiKeyPlaceholder = (provider: CloudProviderId) => {
    if (provider === "groq") {
      return "gsk_...";
    }

    if (provider === "openrouter") {
      return "sk-or-...";
    }

    return "sk-...";
  };

  const renderCloudProviderDescription = (provider: CloudProviderId) => {
    if (provider === "openrouter") {
      return <Trans>Access many model providers through one API key.</Trans>;
    }

    if (provider === "groq") {
      return <Trans>Use Groq-hosted fast inference models with your API key.</Trans>;
    }

    return <Trans>Use OpenAI models directly with your API key.</Trans>;
  };

  // Use models from the central registry filtered to show_in_selector
  const visibleModels = models.filter((m) => m.show_in_selector);
  const visibleCloudModels = useMemo(() => cloudModels, [cloudModels]);
  const cloudProviderSections = useMemo(() => {
    const providers: CloudProviderId[] = ["openrouter", "openai", "groq"];
    const search = modelSearch.trim().toLowerCase();

    return providers
      .map((provider) => {
        const providerModels = visibleCloudModels.filter(model => getCloudProviderIdFromModelId(model.id) === provider);
        const expanded = expandedCloudProvider === provider;
        const collapsedModels = Array.from(
          new Map(
            providerModels
              .filter(model => model.isSelected || model.isRecommended)
              .slice(0, 5)
              .map(model => [model.id, model]),
          ).values(),
        );
        const searchedModels = search
          ? providerModels.filter((model) => {
            const haystack = [
              model.name,
              model.vendor,
              model.providerModelId,
              model.description,
            ].filter(Boolean).join(" ").toLowerCase();

            return haystack.includes(search);
          })
          : providerModels;

        return {
          provider,
          expanded,
          models: expanded ? searchedModels.slice(0, 80) : collapsedModels,
          totalCount: providerModels.length,
          hiddenCount: Math.max(providerModels.length - collapsedModels.length, 0),
        };
      })
      .filter(section => section.totalCount > 0);
  }, [expandedCloudProvider, modelSearch, visibleCloudModels]);

  const handleSelectCloudModel = async (model: typeof visibleCloudModels[number]) => {
    if (!model.isAvailable) {
      return;
    }

    await selectModel(model);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            <Trans>Chat</Trans>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            <Trans>AI models for answering questions and summarizing your meetings</Trans>
          </p>
        </div>
        {supportsLocalModels && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleShowFileLocation("llm")}
            className="text-xs h-7 gap-1.5 text-muted-foreground shrink-0"
          >
            <i className="ri-folder-3-line text-sm" />
            <Trans>Open folder</Trans>
          </Button>
        )}
      </div>

      {/* Local Models */}
      {supportsLocalModels && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <Trans>On-device</Trans>
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            <Trans>Only GGUF chat models are supported locally.</Trans>
          </p>
          <div className="space-y-2">
            {isLoading
              ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <i className="ri-loader-4-line animate-spin text-base mr-2" />
                  <Trans>Loading models…</Trans>
                </div>
              )
              : visibleModels.map((model) => {
                const isDownloading = downloadingModels.has(model.id);

                return (
                  <div
                    key={model.id}
                    className="flex gap-3 rounded-lg border border-border bg-background px-4 py-3"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                      <i className={cn("text-base text-foreground", model.icon || "ri-robot-line")} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{model.name}</span>
                        <span className="text-[11px] text-muted-foreground">{model.provider}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {model.description}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {model.isDownloaded
                        ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                            <Trans>Ready</Trans>
                          </span>
                        )
                        : isDownloading
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
                              handleModelDownload(model.id);
                            }}
                            className="text-xs h-7 gap-1.5"
                          >
                            <i className="ri-download-line text-sm" />
                            {model.size}
                          </Button>
                        )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {visibleCloudModels.length > 0 && (
        <div>
          {supportsLocalModels && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              <Trans>Cloud</Trans>
            </p>
          )}
          <div className="space-y-2">
            {cloudModelsLoading
              ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <i className="ri-loader-4-line animate-spin text-base mr-2" />
                  <Trans>Loading models…</Trans>
                </div>
              )
              : cloudProviderSections.map((section) => {
                const providerApiKey = cloudApiKeys[section.provider];
                const hasProviderApiKey = providerApiKey.trim().length > 0;
                const providerApiKeyInputId = `${cloudApiKeyInputId}-${section.provider}`;

                return (
                  <div key={section.provider} className="rounded-lg border border-border bg-background p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                          <i className={cn("text-base text-foreground", getCloudProviderIcon(section.provider))} />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {getCloudProviderLabel(section.provider)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {renderCloudProviderDescription(section.provider)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          hasProviderApiKey
                            ? "border-success/20 bg-success/5 text-success"
                            : "border-primary/20 bg-primary/5 text-primary",
                        )}
                      >
                        {hasProviderApiKey ? <Trans>Key configured</Trans> : <Trans>API key required</Trans>}
                      </span>
                    </div>

                    <div className="mb-3 grid gap-1.5">
                      <label htmlFor={providerApiKeyInputId} className="text-xs font-medium text-muted-foreground">
                        <Trans>API key</Trans>
                      </label>
                      <Input
                        id={providerApiKeyInputId}
                        type="password"
                        value={providerApiKey}
                        placeholder={getCloudApiKeyPlaceholder(section.provider)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCloudApiKeys((keys) => ({ ...keys, [section.provider]: value }));
                        }}
                        onBlur={(event) => void saveCloudApiKey(section.provider, event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        {hasProviderApiKey
                          ? <Trans>Key stored locally and used directly with this provider.</Trans>
                          : <Trans>Add a key to use this provider.</Trans>}
                      </p>
                    </div>

                    {section.expanded && (
                      <div className="mb-2 flex items-center gap-2">
                        <Input
                          value={modelSearch}
                          placeholder={t`Search models`}
                          className="h-8 text-xs"
                          onChange={(event) => setModelSearch(event.target.value)}
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {section.totalCount}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      {section.models.map((model) => {
                        const isReady = model.isAvailable;

                        return (
                          <div
                            key={model.id}
                            className={cn(
                              "flex gap-3 rounded-md border border-border/70 px-3 py-2",
                              model.isSelected && "border-primary/30 bg-primary/5",
                              !isReady && "opacity-70",
                            )}
                          >
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                              <i className={cn("text-sm text-foreground", model.customIcon || "ri-robot-line")} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground">{model.name}</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  {model.vendor || model.provider}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {isReady ? model.description : <Trans>Add API key above</Trans>}
                              </p>
                            </div>

                            <div className="shrink-0">
                              {isReady
                                ? (
                                  <Button
                                    size="sm"
                                    variant={model.isSelected ? "secondary" : "outline"}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleSelectCloudModel(model);
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    {model.isSelected ? <Trans>Selected</Trans> : <Trans>Use</Trans>}
                                  </Button>
                                )
                                : (
                                  <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                                    <Trans>API key required</Trans>
                                  </span>
                                )}
                            </div>
                          </div>
                        );
                      })}

                      {section.models.length === 0 && (
                        <p className="px-1 py-2 text-xs text-muted-foreground">
                          <Trans>No models found</Trans>
                        </p>
                      )}

                      {(section.hiddenCount > 0 || section.expanded) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full justify-start text-xs text-muted-foreground"
                          onClick={() => {
                            setModelSearch("");
                            setExpandedCloudProvider(section.expanded ? null : section.provider);
                          }}
                        >
                          {section.expanded ? <Trans>Show fewer</Trans> : <Trans>More models</Trans>}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
