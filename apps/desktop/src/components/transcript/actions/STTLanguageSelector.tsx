import { getAvailableSettingsSttModels, sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";

import { useModelAvailabilityLabel } from "@/hooks/useModelAvailabilityLabel";
import { usePlatform } from "@/hooks/usePlatform";
import { openSettingsWindow } from "@/utils/open-settings-window";
import {
  getAvailableLanguageOptions,
  getSttModelDescription,
  getSttModelLabel,
  getSttModelSize,
  LANGUAGE_OPTIONS,
  type LanguageOption,
} from "../constants/languageData";
import { useModelDownload } from "../hooks/useModelDownload";
import { STTProviderIcon } from "../STTProviderIcon";

export interface STTLanguageSelectorProps {
  value: LanguageOption;
  onChange: (value: LanguageOption) => void;
  disabled?: boolean;
  size?: "compact" | "full";
  isActive?: boolean;
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
  const statusLabel = useModelAvailabilityLabel();
  const [isOpen, setIsOpen] = useState(false);
  const { getModelAvailability, downloadModel, retry } = useModelDownload();
  const { supportsLocalModels } = usePlatform();
  const capabilities = useQuery(sttCapabilitiesQueryOptions());
  const availableOptions = getAvailableLanguageOptions(
    supportsLocalModels,
    getAvailableSettingsSttModels(capabilities.data),
  );
  const selectedOption = LANGUAGE_OPTIONS.find(option => option.key === value || option.modelKey === value);
  const selectedAvailability = getModelAvailability(selectedOption?.modelKey ?? value);
  const isCompact = size === "compact";
  const showCustomTrigger = !!triggerLabel && !isActive;
  const isInlineTrigger = showCustomTrigger && triggerVariant === "inline";
  const openSettings = () => {
    setIsOpen(false);
    return openSettingsWindow("/app/settings?tab=ai&section=transcription");
  };

  const handleSelect = (optionKey: LanguageOption) => {
    if (!getModelAvailability(optionKey).canSelect) {
      return;
    }
    onChange(optionKey);
    setIsOpen(false);
  };

  const selectorButton = (
    <Button
      variant="ghost"
      size={isActive ? "icon" : undefined}
      disabled={disabled}
      title={selectedOption ? getSttModelLabel(selectedOption.key) : t`Select model`}
      className={cn(
        isInlineTrigger
          ? "h-auto gap-0.5 px-0 py-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
          : isActive
          ? "h-7 w-auto gap-0.5 px-1.5 transition-all"
          : "justify-between gap-1.5 h-7 px-2 text-sm transition-all",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      onClick={() => !disabled && setIsOpen(!isOpen)}
    >
      {isActive
        ? (
          <>
            <STTProviderIcon model={selectedOption?.modelKey ?? ""} />
            <i
              aria-hidden="true"
              className={cn(
                "ri-arrow-down-s-line text-xs text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </>
        )
        : (
          <>
            {showCustomTrigger
              ? (
                <span className={isCompact || isInlineTrigger ? "text-xs font-medium" : "text-sm font-medium"}>
                  {triggerLabel}
                </span>
              )
              : (
                <span className="flex items-center gap-1.5">
                  <STTProviderIcon model={selectedOption?.modelKey ?? ""} />
                  <span className={isCompact ? "text-xs" : "text-xs font-medium"}>
                    {selectedOption ? getSttModelLabel(selectedOption.key) : <Trans>Select model</Trans>}
                  </span>
                </span>
              )}
            <i
              className={cn(
                "ri-arrow-down-s-line text-sm text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </>
        )}
      <span className="sr-only">
        {selectedOption ? getSttModelLabel(selectedOption.key) : <Trans>Select model</Trans>}
      </span>
    </Button>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{selectorButton}</TooltipTrigger>
        <TooltipContent>
          <Trans>Stop or pause recording to change transcription model</Trans>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{selectorButton}</PopoverTrigger>
      <PopoverContent
        className="w-80 max-w-[var(--radix-popover-content-available-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain border-0 shadow-lg"
        align="center"
        sideOffset={4}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground" role="status">{statusLabel(selectedAvailability)}</p>
          {[true, false].map(local => {
            const options = availableOptions.filter(option => option.isLocal === local);
            if (!options.length) {
              return null;
            }
            return (
              <div key={local ? "local" : "cloud"} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {local ? <Trans>On-device</Trans> : <Trans>Cloud Models</Trans>}
                </div>
                {options.map(option => {
                  const availability = getModelAvailability(option.modelKey);
                  const size = getSttModelSize(option.modelKey, capabilities.data);
                  const isSelected = selectedOption?.modelKey === option.modelKey;
                  return (
                    <div
                      key={option.key}
                      role="group"
                      aria-label={getSttModelLabel(option.key)}
                      className={cn("flex items-center gap-1 rounded-md", isSelected && "bg-muted/50 border border")}
                    >
                      <Button
                        variant="ghost"
                        className="flex-1 min-w-0 justify-start text-left h-auto p-2.5 hover:bg-surface-400/50 rounded-md whitespace-normal"
                        onClick={() => handleSelect(option.key)}
                        disabled={!availability.canSelect}
                      >
                        <span className="flex items-start gap-2.5 min-w-0">
                          <STTProviderIcon model={option.modelKey} className="mt-0.5" />
                          <span className="min-w-0">
                            <span className="font-medium text-xs leading-tight">{getSttModelLabel(option.key)}</span>
                            <span className="block text-xs text-muted-foreground leading-tight mt-0.5 break-words">
                              {availability.status === "ready" && availability.reason !== "native-fallback"
                                ? getSttModelDescription(option.key, capabilities.data)
                                : statusLabel(availability)}
                            </span>
                          </span>
                        </span>
                      </Button>
                      <div className="flex items-center gap-1 pr-2">
                        {availability.canDownload && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label={t`Download ${size}`}
                            title={t`Download ${size}`}
                            onClick={() => void downloadModel(option.key)}
                          >
                            <i className="ri-download-line text-sm" />
                          </Button>
                        )}
                        {availability.canRetry && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label={t`Retry`}
                            title={t`Retry`}
                            onClick={() => void retry()}
                          >
                            <i className="ri-refresh-line text-sm" />
                          </Button>
                        )}
                        {(availability.status === "needs-api-key" || availability.status === "unavailable")
                          && availability.canConfigure && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            aria-label={t`Open Settings`}
                            title={t`Open Settings`}
                            onClick={() => void openSettings()}
                          >
                            <i className="ri-settings-3-line text-sm" />
                          </Button>
                        )}
                        {(availability.status === "downloading" || availability.status === "loading"
                            || availability.status === "checking")
                          ? <i className="ri-loader-4-line text-sm animate-spin" aria-hidden="true" />
                          : isSelected && <i className="ri-check-line text-sm text-primary" aria-hidden="true" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <Button variant="ghost" size="sm" onClick={() => void openSettings()}>
            <Trans>Open Settings</Trans>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
