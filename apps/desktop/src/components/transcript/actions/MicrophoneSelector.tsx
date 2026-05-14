import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// Remix Icon Components
function CheckIcon({ size = 16, className = "" }) {
  return <i className={`ri-check-line ${className}`} style={{ fontSize: size }} />;
}

import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";

import { AUTO_MICROPHONE_VALUE, useMicrophoneDevice } from "../hooks/useMicrophoneDevice";

export interface MicrophoneSelectorProps {
  disabled?: boolean;
  size?: "compact" | "full";
  isActive?: boolean; // When true, uses ghost style with no borders
}

export function MicrophoneSelector({
  disabled = false,
  size = "full",
  isActive = false,
}: MicrophoneSelectorProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { allDevices, currentDevice, isAutoMode, isLoading, selectDevice } = useMicrophoneDevice();

  const handleSelectDevice = async (device: string) => {
    await selectDevice(device);
    setIsOpen(false);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["microphone", "devices"] });
    queryClient.invalidateQueries({ queryKey: ["microphone", "current-device"] });
    queryClient.invalidateQueries({ queryKey: ["microphone", "selection-mode"] });
  };

  // const displayName = "Audio input";

  const truncateDeviceName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength) + "...";
  };

  const isIconOnly = isActive || size === "compact";

  const SelectorButton = (
    <Button
      variant="ghost"
      size={isIconOnly ? "icon" : undefined}
      disabled={disabled || isLoading}
      title={isIconOnly ? (currentDevice || t`No microphone selected`) : undefined}
      className={cn(
        isIconOnly
          ? "h-7 w-7 transition-all" // Icon-only when active or compact
          : "h-7 px-2 gap-1.5 justify-between transition-all", // Full layout
        disabled && "opacity-50 cursor-not-allowed",
      )}
      onClick={() => !disabled && setIsOpen(!isOpen)}
    >
      {isIconOnly
        ? (
          // Icon-only: just the mic icon
          <i className="ri-mic-fill text-sm" />
        )
        : (
          // Full: device name + chevron
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <i className="ri-mic-fill text-sm flex-shrink-0" />
              <span className="text-xs truncate">
                {isLoading
                  ? <Trans>Loading...</Trans>
                  : isAutoMode
                  ? currentDevice
                    ? `${t`Auto`}: ${truncateDeviceName(currentDevice)}`
                    : <Trans>Auto</Trans>
                  : currentDevice
                  ? truncateDeviceName(currentDevice)
                  : <Trans>No device</Trans>}
              </span>
            </div>
            <i
              className={cn(
                "ri-arrow-down-s-line text-sm text-muted-foreground transition-transform duration-200 flex-shrink-0",
                isOpen && "rotate-180",
              )}
            />
          </>
        )}
      <span className="sr-only">
        {isLoading ? <Trans>Loading microphones...</Trans> : <Trans>Audio input settings</Trans>}
      </span>
    </Button>
  );

  if (disabled) {
    return SelectorButton;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {SelectorButton}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="center" sideOffset={4}>
        <div className="space-y-3">
          {isLoading
            ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-muted-foreground mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">
                  <Trans>Loading devices...</Trans>
                </p>
              </div>
            )
            : allDevices.length === 0
            ? (
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  <Trans>No microphones found</Trans>
                </p>
              </div>
            )
            : (
              <>
                <div className="space-y-0.5">
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-left h-8 px-2",
                      "hover:bg-surface-400",
                      isAutoMode && "bg-muted/50",
                    )}
                    onClick={() => handleSelectDevice(AUTO_MICROPHONE_VALUE)}
                  >
                    <i className="ri-computer-line w-4 h-4 mr-2 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate flex-1">
                      <Trans>System Default (Auto)</Trans>
                    </span>
                    {isAutoMode && <CheckIcon size={16} className="ml-auto flex-shrink-0 text-primary" />}
                  </Button>
                  {allDevices.map((device) => {
                    const isSelected = !isAutoMode && device === currentDevice;

                    return (
                      <Button
                        key={device}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start text-left h-8 px-2",
                          "hover:bg-surface-400",
                          isSelected && "bg-muted/50",
                        )}
                        onClick={() => handleSelectDevice(device)}
                      >
                        <i className="ri-mic-line w-4 h-4 mr-2 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate flex-1">{device}</span>
                        {isSelected && <CheckIcon size={16} className="ml-auto flex-shrink-0 text-primary" />}
                      </Button>
                    );
                  })}
                </div>

                {/* Subtle helper text with refresh */}
                <div className="flex items-center justify-center gap-1 pt-2 border-t border/50">
                  <span className="text-xs text-muted-foreground">
                    <Trans>Not seeing your device?</Trans>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-400/50"
                    onClick={handleRefresh}
                    disabled={isLoading}
                  >
                    <Trans>Refresh</Trans>
                  </Button>
                </div>
              </>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
