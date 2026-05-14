import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";

interface ModeSelectorProps {
  currentMode: "chat" | "edit";
  onModeChange: (mode: "chat" | "edit") => void;
  className?: string;
}

export function ModeSelector({ currentMode, onModeChange, className }: ModeSelectorProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);

  // Define modes with i18n support - using t directly in component scope
  const modes = [
    {
      value: "chat" as const,
      label: t`Ask`,
      icon: "ri-chat-3-line",
      description: t`Ask about your meeting content, transcript, and notes`,
      tooltip: t`Ask questions`,
    },
    {
      value: "edit" as const,
      label: t`Edit`,
      icon: "ri-edit-2-line",
      description: t`AI writes and edits your notes with natural language`,
      tooltip: t`AI writing agent`,
    },
  ];

  const currentModeConfig = modes.find(m => m.value === currentMode) || modes[0];

  return (
    <TooltipProvider delayDuration={300}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-2 gap-1.5 transition-all duration-200",
                  "focus-visible:ring-1 focus-visible:ring-ring",
                  currentMode === "edit"
                    ? "text-[hsl(var(--sidebar-primary))] hover:text-[hsl(var(--sidebar-primary))]"
                    : "text-muted-foreground hover:text-foreground",
                  className,
                )}
              >
                <i className={`${currentModeConfig.icon} h-4 w-4`} />
                <span className="text-xs font-medium">{currentModeConfig.label}</span>
                <ChevronDownIcon className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {currentModeConfig.tooltip}
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          className="w-72 p-3 overflow-hidden"
          side="top"
          align="start"
          sideOffset={8}
        >
          <div className="space-y-1.5 max-w-full">
            {modes.map((mode) => (
              <div
                key={mode.value}
                className={cn(
                  "w-full h-auto p-3 rounded-lg transition-colors cursor-pointer",
                  "hover:bg-surface-400/50 flex items-center",
                  currentMode === mode.value && "bg-accent text-accent-foreground border border-primary/20",
                )}
                onClick={() => {
                  onModeChange(mode.value);
                  setIsOpen(false);
                }}
              >
                {/* Column 1: Mode Icon (Fixed 16px) */}
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  <i className={`${mode.icon} text-base`} />
                </div>

                {/* Column 2: Mode Info (Flex-grow) */}
                <div className="flex flex-col flex-1 ml-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs">
                      {mode.label}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {mode.description}
                  </span>
                </div>

                {/* Column 3: Check Icon (Fixed width) */}
                <div className="flex items-center ml-2">
                  {currentMode === mode.value && <i className="ri-check-line text-base text-success" />}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
