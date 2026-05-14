import { Trans, useLingui } from "@lingui/react/macro";
// Using remix icons instead of lucide
import { type ReactNode, useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";

import { usePlatform } from "@/hooks/usePlatform";
import { getAvailableLanguageOptions, type LanguageOption } from "../constants/languageData";
import { useModelDownload } from "../hooks/useModelDownload";

export interface STTLanguageSelectorProps {
  value: LanguageOption;
  onChange: (value: LanguageOption) => void;
  disabled?: boolean;
  size?: "compact" | "full";
  isActive?: boolean; // When true, uses ghost style with no borders
  triggerLabel?: ReactNode;
  triggerVariant?: "button" | "inline";
}

export function STTLanguageSelector({
  value,
  onChange,
  disabled = false,
  size = "full",
  isActive = false,
  triggerLabel,
  triggerVariant = "button",
}: STTLanguageSelectorProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const { getModelStatus, downloadModel } = useModelDownload();
  const { supportsLocalModels } = usePlatform();

  // Use filtered options based on platform
  const availableOptions = getAvailableLanguageOptions(supportsLocalModels);
  const selectedOption = availableOptions.find(option => option.key === value);
  const isCompact = size === "compact";

  // If only one option, use it regardless of what's in state
  const displayOption = availableOptions.length === 1 ? availableOptions[0] : selectedOption;

  // Debug: Log if icon is missing
  if (!displayOption && value) {
    console.warn("[STT Selector] No option found for value:", value, "Available:", availableOptions.map(o => o.key));
  }

  // If only one option available, make it display-only (non-interactive)
  const isSingleOption = availableOptions.length === 1;
  const showCustomTrigger = !!triggerLabel && !isActive && !isSingleOption;
  const isInlineTrigger = showCustomTrigger && triggerVariant === "inline";

  // Helper function to get translated model labels and descriptions
  const getTranslatedLabel = (key: string) => {
    switch (key) {
      case "balanced":
        return t`Multilingual`;
      case "english":
        return t`English high accuracy`;
      case "multilingual":
        return t`Multilingual high accuracy`;
      case "assemblyai-universal":
        return t`Multilingual`;
      default:
        return key;
    }
  };

  const getTranslatedDescription = (key: string) => {
    switch (key) {
      case "balanced":
        return t`Good for most meetings and calls`;
      case "english":
        return t`Best for English-only, professional use`;
      case "multilingual":
        return t`Best for international meetings`;
      case "assemblyai-universal":
        return t`Works with any language automatically`;
      default:
        return "";
    }
  };

  const handleSelect = (optionKey: LanguageOption) => {
    const option = availableOptions.find(o => o.key === optionKey);

    // Cloud models don't need download check
    if (option && "isCloud" in option && option.isCloud) {
      onChange(optionKey);
      setIsOpen(false);
      return;
    }

    // Existing download check for local models
    const modelStatus = getModelStatus(optionKey);
    if (modelStatus.isDownloaded) {
      onChange(optionKey);
      setIsOpen(false);
    } else {
      // Show download required message but keep modal open
      // User needs to download first
    }
  };

  const handleDownload = (optionKey: LanguageOption, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent option selection
    downloadModel(optionKey);
  };

  const SelectorButton = (
    <Button
      variant="ghost"
      size={isActive ? "icon" : undefined}
      disabled={disabled}
      title={isActive ? (selectedOption ? getTranslatedLabel(selectedOption.key) : "Select model") : undefined}
      className={cn(
        isInlineTrigger
          ? "h-auto gap-0.5 px-0 py-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
          : isActive
          ? "h-7 w-7 transition-all" // Icon-only when active
          : "justify-between gap-1.5 h-7 px-2 text-sm transition-all", // Full layout when not active
        disabled && "opacity-50 cursor-not-allowed",
      )}
      onClick={() => !disabled && setIsOpen(!isOpen)}
    >
      {isActive
        ? (
          // Active state: just the model icon
          displayOption?.iconClass && <i className={`${displayOption.iconClass} text-sm`} />
        )
        : showCustomTrigger
        ? (
          <>
            <span
              className={isInlineTrigger
                ? "text-xs font-medium"
                : isCompact
                ? "text-xs font-medium"
                : "text-sm font-medium"}
            >
              {triggerLabel}
            </span>
            <i
              className={cn(
                isInlineTrigger
                  ? "ri-arrow-down-s-line text-xs text-muted-foreground transition-transform duration-200"
                  : "ri-arrow-down-s-line text-sm text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </>
        )
        : (
          // Inactive state: model name + optional chevron
          <>
            <div className="flex items-center gap-1.5">
              {displayOption?.iconClass && <i className={`${displayOption.iconClass} text-sm`} />}
              <span className={isCompact ? "text-xs" : "text-xs font-medium"}>
                {displayOption ? getTranslatedLabel(displayOption.key) : <Trans>Select model</Trans>}
              </span>
            </div>
            {!isSingleOption && (
              <i
                className={cn(
                  "ri-arrow-down-s-line text-sm text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            )}
          </>
        )}
      <span className="sr-only">
        {selectedOption ? getTranslatedLabel(selectedOption.key) : <Trans>Select model</Trans>}
      </span>
    </Button>
  );

  // If only one option, show as display-only (no dropdown)
  if (isSingleOption) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-default">
            {SelectorButton}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{displayOption ? getTranslatedLabel(displayOption.key) : <Trans>Transcription model</Trans>}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {SelectorButton}
        </TooltipTrigger>
        <TooltipContent>
          <p>
            <Trans>Stop or pause recording to change transcription model</Trans>
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {SelectorButton}
      </PopoverTrigger>
      <PopoverContent className="w-80 border-0 shadow-lg" align="center" sideOffset={4}>
        <div className="space-y-3">
          {/* On-device Models Section - Only show header if local models exist */}
          {availableOptions.some(o => o.isLocal) && (
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Trans>On-device</Trans>
            </div>
          )}
          <div className="space-y-1">
            {availableOptions.filter(o => o.isLocal).map((option) => {
              const isCloud = "isCloud" in option && option.isCloud;
              const modelStatus = isCloud ? null : getModelStatus(option.key);
              const isSelected = value === option.key;

              return (
                <Button
                  key={option.key}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-left h-auto p-2.5 hover:bg-surface-400/50 rounded-md whitespace-normal",
                    isSelected && "bg-muted/50 border border",
                    !isCloud && modelStatus && !modelStatus.isDownloaded && "opacity-75",
                  )}
                  onClick={() => handleSelect(option.key)}
                  disabled={!isCloud && modelStatus?.isDownloading}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <i
                        className={`${option.iconClass} text-base mt-0.5 flex-shrink-0 ${
                          !isCloud && modelStatus && !modelStatus.isDownloaded ? "text-muted-foreground/70" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-xs leading-tight">
                            {getTranslatedLabel(option.key)}
                          </div>
                          {!isCloud && modelStatus && !modelStatus.isDownloaded && (
                            <span className="text-xs text-muted-foreground/70 font-medium">{option.size}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground leading-tight mt-0.5 break-words">
                          {isCloud
                            ? getTranslatedDescription(option.key)
                            : modelStatus && !modelStatus.isDownloaded
                            ? t`Not downloaded`
                            : getTranslatedDescription(option.key)}
                        </div>
                        {/* Show accuracy/speed for all models to help users decide whether to download */}
                        {
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground/70 font-medium">{t`Accuracy`}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3].map((dot) => (
                                  <div
                                    key={dot}
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      dot <= option.accuracy ? "bg-primary" : "bg-border",
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground/70 font-medium">{t`Speed`}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3].map((dot) => (
                                  <div
                                    key={dot}
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      dot <= option.speed ? "bg-primary" : "bg-border",
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      {isCloud
                        ? (
                          <>
                            {isSelected && <i className="ri-check-line text-sm text-success" />}
                          </>
                        )
                        : modelStatus && !modelStatus.isDownloaded
                        ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-surface-400 hover:text-foreground cursor-pointer transition-colors",
                                  modelStatus.isDownloading && "opacity-50 cursor-not-allowed",
                                )}
                                onClick={(e) => !modelStatus.isDownloading && handleDownload(option.key, e)}
                              >
                                {modelStatus.isDownloading
                                  ? <i className="ri-loader-4-line text-sm animate-spin" />
                                  : <i className="ri-download-line text-sm" />}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>{modelStatus.isDownloading ? "Downloading..." : `Download ${option.size}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        )
                        : (
                          <>
                            {isSelected && <i className="ri-check-line text-sm text-primary" />}
                            {option.hasInfo && <LanguageInfoTooltip />}
                          </>
                        )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>

          {/* Cloud Models Section - Only show header if both local AND cloud models exist */}
          {availableOptions.some(o => o.isLocal) && availableOptions.some(o => "isCloud" in o && o.isCloud) && (
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Trans>Cloud Models</Trans>
            </div>
          )}
          <div className="space-y-1">
            {availableOptions.filter(o => "isCloud" in o && o.isCloud).map((option) => {
              const isCloud = "isCloud" in option && option.isCloud;
              const modelStatus = isCloud ? null : getModelStatus(option.key);
              const isSelected = value === option.key;

              return (
                <Button
                  key={option.key}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-left h-auto p-2.5 hover:bg-surface-400/50 rounded-md whitespace-normal",
                    isSelected && "bg-muted/50 border border",
                    !isCloud && modelStatus && !modelStatus.isDownloaded && "opacity-75",
                  )}
                  onClick={() => handleSelect(option.key)}
                  disabled={!isCloud && modelStatus?.isDownloading}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <i
                        className={`${option.iconClass} text-base mt-0.5 flex-shrink-0 ${
                          !isCloud && modelStatus && !modelStatus.isDownloaded ? "text-muted-foreground/70" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-xs leading-tight">
                            {getTranslatedLabel(option.key)}
                          </div>
                          {!isCloud && modelStatus && !modelStatus.isDownloaded && (
                            <span className="text-xs text-muted-foreground/70 font-medium">{option.size}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground leading-tight mt-0.5 break-words">
                          {isCloud
                            ? getTranslatedDescription(option.key)
                            : modelStatus && !modelStatus.isDownloaded
                            ? t`Not downloaded`
                            : getTranslatedDescription(option.key)}
                        </div>
                        {/* Show accuracy/speed for all models to help users decide whether to download */}
                        {
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground/70 font-medium">{t`Accuracy`}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3].map((dot) => (
                                  <div
                                    key={dot}
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      dot <= option.accuracy ? "bg-primary" : "bg-border",
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground/70 font-medium">{t`Speed`}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3].map((dot) => (
                                  <div
                                    key={dot}
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      dot <= option.speed ? "bg-primary" : "bg-border",
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      {isCloud
                        ? (
                          <>
                            {isSelected && <i className="ri-check-line text-sm text-primary" />}
                          </>
                        )
                        : modelStatus && !modelStatus.isDownloaded
                        ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-surface-400 hover:text-foreground cursor-pointer transition-colors",
                                  modelStatus.isDownloading && "opacity-50 cursor-not-allowed",
                                )}
                                onClick={(e) => !modelStatus.isDownloading && handleDownload(option.key, e)}
                              >
                                {modelStatus.isDownloading
                                  ? <i className="ri-loader-4-line text-sm animate-spin" />
                                  : <i className="ri-download-line text-sm" />}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>{modelStatus.isDownloading ? "Downloading..." : `Download ${option.size}`}</p>
                            </TooltipContent>
                          </Tooltip>
                        )
                        : (
                          <>
                            {isSelected && <i className="ri-check-line text-sm text-primary" />}
                            {option.hasInfo && <LanguageInfoTooltip />}
                          </>
                        )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LanguageInfoTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <i className="ri-information-2-fill text-xs text-muted-foreground/70 cursor-help hover:text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs text-xs">
        <div className="space-y-1.5">
          <div>
            <div className="font-medium text-xs text-success">
              <Trans>Excellent (2.8-5.0% error)</Trans>
            </div>
            <div className="text-xs text-muted-foreground leading-tight">
              <Trans>Spanish, Italian, Korean, Portuguese, English, Polish, Japanese, German, Russian</Trans>
            </div>
          </div>
          <div>
            <div className="font-medium text-xs text-blue-dark">
              <Trans>Good (5.2-7.8% error)</Trans>
            </div>
            <div className="text-xs text-muted-foreground leading-tight">
              <Trans>Dutch, French, Indonesian, Ukrainian, Turkish, Swedish, Mandarin, Finnish</Trans>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <Trans>+ 10 more languages supported</Trans>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
