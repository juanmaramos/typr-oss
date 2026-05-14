import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { openSettingsWindow } from "@/utils/open-settings-window";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Spinner } from "@typr/ui/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";

import { showLlmModelDownloadToast } from "@/components/toast/shared";
import {
  CloudProviderId,
  getCloudProviderIcon,
  getCloudProviderIdFromModelId,
  getCloudProviderLabel,
} from "@/hooks/cloud-model-catalog";
import { useAIAvailability } from "@/hooks/useAIAvailability";
import { useAllModels, useModelSelection, useModelSelectionState } from "@/hooks/useModels";
import { ModelOption, ModelType } from "@/types/models";

interface ModelSelectorProps {
  className?: string;
  compact?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * ModelSelector - Production-ready component with clean architecture
 * Now uses centralized configuration and services while maintaining
 * the same functionality in a single file for simplicity
 */
export function ModelSelector({ className, compact = false, onOpenChange }: ModelSelectorProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [isOnDeviceCollapsed, setIsOnDeviceCollapsed] = useState(false);
  const [isCloudCollapsed, setIsCloudCollapsed] = useState(false);
  const [expandedCloudProvider, setExpandedCloudProvider] = useState<CloudProviderId | null>(null);
  const [collapsedCloudProviders, setCollapsedCloudProviders] = useState<Set<CloudProviderId>>(() => new Set());
  const [modelSearch, setModelSearch] = useState("");
  const queryClient = useQueryClient();

  const { allModels, selectedModel, isAutoMode, isLoading, error } = useAllModels();
  const { hasUsableModel, isCheckingAvailability, isLocalModelDownloading } = useAIAvailability();

  // Removed debug logging - even in development mode it causes performance issues
  // If needed for debugging, uncomment temporarily
  /*
  if (process.env.NODE_ENV === 'development') {
    console.log("🎨 Model Selector render:", {
      selectedModel: selectedModel?.name,
      selectedId: selectedModel?.id,
      allModelsCount: allModels.length
    });
  }
  */

  // Get models that should be shown (downloaded + undownloaded for on-device section)
  const downloadedModels = useMemo(
    () => allModels.filter(model => model.isDownloaded && model.type !== ModelType.CLOUD),
    [allModels],
  );
  const undownloadedModels = useMemo(
    () => allModels.filter(model => !model.isDownloaded && model.type !== ModelType.CLOUD),
    [allModels],
  );
  const customModels = useMemo(() => allModels.filter(model => model.type === ModelType.CLOUD), [allModels]);
  const cloudProviderSections = useMemo(() => {
    const providers: CloudProviderId[] = ["openrouter", "openai", "groq"];
    const search = modelSearch.trim().toLowerCase();

    return providers
      .map((provider) => {
        const providerModels = customModels.filter(model => getCloudProviderIdFromModelId(model.id) === provider);
        const expanded = expandedCloudProvider === provider;
        const collapsed = collapsedCloudProviders.has(provider);
        const previewModels = Array.from(
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
          collapsed,
          selectedModel: providerModels.find(model => model.isSelected),
          models: expanded ? searchedModels.slice(0, 40) : previewModels,
          totalCount: providerModels.length,
          hiddenCount: Math.max(providerModels.length - previewModels.length, 0),
        };
      })
      .filter(section => section.totalCount > 0);
  }, [collapsedCloudProviders, customModels, expandedCloudProvider, modelSearch]);

  const showNoModelState = !hasUsableModel && !isCheckingAvailability;

  // Check if only one model available (Windows cloud-only case)
  const availableModelsCount = downloadedModels.length + undownloadedModels.length + customModels.length;
  const isSingleModelAvailable = availableModelsCount === 1;

  // If only one model available, use it regardless of selection state
  const displayModel = isSingleModelAvailable && availableModelsCount > 0
    ? (downloadedModels[0] || customModels[0])
    : isAutoMode
    ? null // Auto mode has its own display
    : selectedModel;

  const { selectModel } = useModelSelection();
  const { setAutoMode, setManualMode } = useModelSelectionState();
  const autoDescription = t`Uses connected cloud models first, then on-device models`;
  const autoTooltip = t`Auto - Best available configured model`;

  // Error handling
  if (error) {
    console.error("Model loading error:", error);
  }

  const handleIsOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setExpandedCloudProvider(null);
      setModelSearch("");
    }
    onOpenChange?.(open);
  };

  const toggleCloudProviderCollapsed = (provider: CloudProviderId) => {
    setCollapsedCloudProviders((current) => {
      const next = new Set(current);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });

    if (expandedCloudProvider === provider) {
      setExpandedCloudProvider(null);
      setModelSearch("");
    }
  };

  const handleModelSelect = async (model: ModelOption) => {
    if (model.type === ModelType.CLOUD && !model.isAvailable) {
      await handleAddModels();
      return;
    }

    try {
      await selectModel(model);
      setManualMode(); // Switch to manual mode when selecting specific model
      handleIsOpenChange(false);
    } catch (error) {
      console.error("Failed to select model:", error);
    }
  };

  const handleAutomaticSelect = async () => {
    try {
      setAutoMode();
      handleIsOpenChange(false);
    } catch (error) {
      console.error("Failed to select automatic model:", error);
    }
  };

  const handleModelDownload = (model: ModelOption) => {
    // Extract the local model key from the model id
    const modelKey = model.id.replace("local-", "");
    showLlmModelDownloadToast(
      modelKey as any, // Cast to SupportedModel type
      () => {
        // Refresh the active model sources used by selectors and banners
        queryClient.invalidateQueries({ queryKey: ["models"] });
        queryClient.invalidateQueries({ queryKey: ["models", "current"] });
        queryClient.invalidateQueries({ queryKey: ["cloud-model", "current"] });
      },
      queryClient,
    );
  };

  const handleAddModels = async () => {
    handleIsOpenChange(false);
    try {
      await openSettingsWindow("/app/settings?tab=ai&section=chat");
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Popover open={isSingleModelAvailable || isLoading ? false : isOpen} onOpenChange={handleIsOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild disabled={isSingleModelAvailable || isLoading}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  compact
                    ? "h-7 px-1.5 gap-1 text-muted-foreground hover:text-foreground"
                    : "h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground transition-colors",
                  "focus-visible:ring-1 focus-visible:ring-ring",
                  className,
                )}
              >
                {isLoading
                  ? (
                    <>
                      <Spinner className="size-4" />
                      {!compact && (
                        <span className="text-xs">
                          <Trans>Loading...</Trans>
                        </span>
                      )}
                    </>
                  )
                  : isAutoMode
                  ? (
                    <>
                      <i
                        className={cn(
                          "ri-sparkling-fill",
                          compact ? "text-[15px]" : "text-base",
                        )}
                      />
                      <span
                        className={cn("font-medium truncate", compact ? "max-w-16 text-[11px]" : "max-w-24 text-xs")}
                      >
                        Auto
                      </span>
                    </>
                  )
                  : displayModel
                  ? (
                    <>
                      <i
                        className={cn(
                          displayModel.customIcon || "ri-cpu-line",
                          compact ? "text-[15px]" : "text-base",
                        )}
                      />
                      <span
                        className={cn("font-medium truncate", compact ? "max-w-16 text-[11px]" : "max-w-24 text-xs")}
                      >
                        {displayModel.name}
                      </span>
                    </>
                  )
                  : showNoModelState
                  ? (
                    <>
                      {/* Show downloading state if any LLM is downloading */}
                      {isLocalModelDownloading || allModels.some(m => m.isDownloading && m.type === ModelType.LOCAL)
                        ? (
                          <>
                            <Spinner className="size-4" />
                            <span className="text-xs font-medium">
                              <Trans>Downloading...</Trans>
                            </span>
                          </>
                        )
                        : (
                          <>
                            <div className="relative">
                              <i className={cn("ri-chat-download-line", compact ? "text-[15px]" : "text-base")} />
                              <div className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-warning" />
                            </div>
                            {!compact && (
                              <span className="text-xs font-medium">
                                <Trans>Select model</Trans>
                              </span>
                            )}
                          </>
                        )}
                    </>
                  )
                  : (
                    <>
                      <i className={cn("ri-flashlight-fill", compact ? "h-[15px] w-[15px]" : "h-4 w-4")} />
                      {!compact && (
                        <span className="text-xs font-medium">
                          <Trans>Select model</Trans>
                        </span>
                      )}
                    </>
                  )}
                {!isLoading && !isSingleModelAvailable && (
                  <ChevronDownIcon className={cn(compact ? "h-3 w-3" : "h-3 w-3")} />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isSingleModelAvailable
              ? displayModel?.name || "AI model"
              : isAutoMode
              ? autoTooltip
              : displayModel
              ? `${displayModel.name} - Click to change`
              : showNoModelState
              ? "Select a model to enable AI features"
              : "Select AI model"}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          className="w-80 max-h-[min(70vh,560px)] overflow-y-auto border-border p-3"
          side="top"
          align="start"
          sideOffset={8}
        >
          <div className="space-y-3 max-w-full">
            {/* Auto Mode */}
            <AutomaticOption
              description={autoDescription}
              isSelected={isAutoMode}
              onSelect={handleAutomaticSelect}
            />

            {/* On-device Models Section - Show both downloaded and undownloaded */}
            {(downloadedModels.length > 0 || undownloadedModels.length > 0) && (
              <div>
                <ModelSectionHeader
                  count={downloadedModels.length + undownloadedModels.length}
                  isCollapsed={isOnDeviceCollapsed}
                  onToggle={() => setIsOnDeviceCollapsed(collapsed => !collapsed)}
                >
                  <Trans>On-device</Trans>
                </ModelSectionHeader>

                {!isOnDeviceCollapsed && (
                  <div className="space-y-0.5">
                    {/* Downloaded models */}
                    {downloadedModels.map((model) => (
                      <ModelItem
                        key={model.id}
                        model={model}
                        isSelected={!isAutoMode && (model.isSelected || false)}
                        onSelect={() => handleModelSelect(model)}
                      />
                    ))}
                    {/* Undownloaded models with download buttons */}
                    {undownloadedModels.map((model) => (
                      <ModelItemWithDownload
                        key={model.id}
                        model={model}
                        onDownload={() => handleModelDownload(model)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cloud Models Section */}
            {customModels.length > 0 && (
              <div>
                <ModelSectionHeader
                  count={customModels.length}
                  isCollapsed={isCloudCollapsed}
                  onToggle={() => setIsCloudCollapsed(collapsed => !collapsed)}
                >
                  <Trans>Cloud Models</Trans>
                </ModelSectionHeader>

                {!isCloudCollapsed && (
                  <div className="space-y-2">
                    {cloudProviderSections.map((section) => (
                      <div key={section.provider} className="space-y-1">
                        <CloudProviderHeader
                          provider={section.provider}
                          totalCount={section.totalCount}
                          isCollapsed={section.collapsed}
                          selectedModel={section.selectedModel}
                          onToggle={() => toggleCloudProviderCollapsed(section.provider)}
                        />

                        {section.expanded && !section.collapsed && (
                          <Input
                            value={modelSearch}
                            placeholder={t`Search models`}
                            className="h-7 text-xs"
                            onChange={(event) => setModelSearch(event.target.value)}
                          />
                        )}

                        {!section.collapsed && (
                          <div className="space-y-0.5">
                            {section.models.map((model) => (
                              <ModelItem
                                key={model.id}
                                model={model}
                                isSelected={!isAutoMode && (model.isSelected || false)}
                                onSelect={() => handleModelSelect(model)}
                              />
                            ))}

                            {section.models.length === 0 && (
                              <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                                <Trans>No models found</Trans>
                              </p>
                            )}

                            {(section.hiddenCount > 0 || section.expanded) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-full justify-start px-2.5 text-xs text-muted-foreground"
                                onClick={() => {
                                  setModelSearch("");
                                  setExpandedCloudProvider(section.expanded ? null : section.provider);
                                }}
                              >
                                {section.expanded ? <Trans>Show fewer</Trans> : <Trans>More models</Trans>}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add Models Action - Hidden since settings menu is not accessible to users */}
            {false && (
              <div className="pt-2 border-t border-border/50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleAddModels}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add Models
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

interface ModelSectionHeaderProps {
  children: ReactNode;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

function ModelSectionHeader({
  children,
  count,
  isCollapsed,
  onToggle,
}: ModelSectionHeaderProps) {
  return (
    <button
      type="button"
      aria-expanded={!isCollapsed}
      className={cn(
        "mb-2 flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left transition-colors",
        "text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-surface-400/50 hover:text-foreground",
      )}
      onClick={onToggle}
    >
      <ChevronDownIcon
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-transform",
          isCollapsed && "-rotate-90",
        )}
      />
      <span>{children}</span>
      <span className="ml-auto shrink-0 text-[10px] tabular-nums">
        {count}
      </span>
    </button>
  );
}

interface CloudProviderHeaderProps {
  provider: CloudProviderId;
  totalCount: number;
  isCollapsed: boolean;
  selectedModel?: ModelOption;
  onToggle: () => void;
}

function CloudProviderHeader({
  provider,
  totalCount,
  isCollapsed,
  selectedModel,
  onToggle,
}: CloudProviderHeaderProps) {
  return (
    <button
      type="button"
      aria-expanded={!isCollapsed}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors",
        "text-muted-foreground hover:bg-surface-400/50 hover:text-foreground",
      )}
      onClick={onToggle}
    >
      <ChevronDownIcon
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-transform",
          isCollapsed && "-rotate-90",
        )}
      />
      <i className={cn(getCloudProviderIcon(provider), "shrink-0 text-base")} />
      <span className="shrink-0 text-xs font-medium">
        {getCloudProviderLabel(provider)}
      </span>
      {selectedModel && isCollapsed && (
        <span className="min-w-0 truncate text-[11px]">
          {selectedModel.name}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[10px] tabular-nums">
        {totalCount}
      </span>
      {selectedModel && isCollapsed && <i className="ri-check-line shrink-0 text-base text-primary" />}
    </button>
  );
}

/**
 * Automatic option component
 */
interface AutomaticOptionProps {
  description: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AutomaticOption({ description, isSelected, onSelect }: AutomaticOptionProps) {
  return (
    <div
      className={cn(
        "w-full px-2.5 py-2 rounded-lg transition-colors cursor-pointer",
        "hover:bg-surface-400/50 flex items-center",
        isSelected && "bg-accent text-accent-foreground border border-primary/20",
      )}
      onClick={onSelect}
    >
      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
        <i className="ri-sparkling-fill text-base" />
      </div>
      <div className="flex flex-col flex-1 ml-2.5 min-w-0">
        <span className="font-medium text-xs leading-tight">Auto</span>
        <span className="text-muted-foreground text-[11px] leading-tight">
          {description}
        </span>
      </div>
      {isSelected && <i className="ri-check-line text-base text-primary ml-2" />}
    </div>
  );
}

/**
 * Model item component - now uses centralized registry
 */
interface ModelItemProps {
  model: ModelOption;
  isSelected: boolean;
  onSelect: () => void;
}

function ModelItem(
  { model, isSelected, onSelect }: ModelItemProps,
) {
  const isUnavailableCloud = model.type === ModelType.CLOUD && !model.isAvailable;

  return (
    <div
      className={cn(
        "w-full h-auto px-2.5 py-2 rounded-lg transition-colors cursor-pointer",
        "hover:bg-surface-400/50 flex items-start",
        isSelected && "bg-accent text-accent-foreground border border-primary/20",
        isUnavailableCloud && "opacity-70",
      )}
      onClick={onSelect}
    >
      {/* Column 1: Provider Icon */}
      <div className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center">
        <i
          className={cn(
            model.customIcon || "ri-cpu-line",
            "text-base",
          )}
        />
      </div>

      {/* Column 2: Model Info */}
      <div className="flex flex-col flex-1 ml-2.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-xs leading-tight">
            {model.name}
          </span>
          {model.size && model.size !== "0 MB" && (
            <span className="text-[11px] text-muted-foreground font-medium">
              {model.size}
            </span>
          )}
        </div>
        {model.description && !isUnavailableCloud && (
          <span className="text-muted-foreground text-[11px] leading-tight">
            {model.description}
          </span>
        )}
        {isUnavailableCloud && (
          <span className="text-muted-foreground text-[11px] leading-tight">
            <Trans>Connect API key</Trans>
          </span>
        )}
      </div>

      {/* Column 3: Status */}
      <div className="flex items-center ml-2 mt-0.5">
        {isUnavailableCloud
          ? <i className="ri-key-2-line text-sm text-muted-foreground" />
          : isSelected
          ? <i className="ri-check-line text-base text-primary" />
          : null}
      </div>
    </div>
  );
}

/**
 * Model item with download button for undownloaded models
 */
interface ModelItemWithDownloadProps {
  model: ModelOption;
  onDownload: () => void;
}

function ModelItemWithDownload({ model, onDownload }: ModelItemWithDownloadProps) {
  return (
    <div className="flex items-start px-2.5 py-2 rounded-lg hover:bg-surface-400/50 transition-colors opacity-75">
      {/* Column 1: Provider Icon */}
      <div className="flex-shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center">
        <i
          className={cn(
            model.customIcon || "ri-cpu-line",
            "text-base text-muted-foreground",
          )}
        />
      </div>

      {/* Column 2: Model Info */}
      <div className="flex flex-col flex-1 ml-2.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-xs leading-tight">
            {model.name}
          </span>
          {model.size && model.size !== "0 MB" && (
            <span className="text-[11px] text-muted-foreground font-medium">
              {model.size}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-[11px] leading-tight">
          {model.isDownloading ? "Downloading..." : model.description}
        </span>
      </div>

      {/* Column 3: Download Button (Fixed width) */}
      <div className="flex-shrink-0 flex items-center justify-center ml-2">
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-6 p-0 rounded"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          disabled={model.isDownloading}
        >
          {model.isDownloading
            ? <i className="ri-loader-line text-xs animate-spin" />
            : <i className="ri-download-line text-xs" />}
        </Button>
      </div>
    </div>
  );
}
