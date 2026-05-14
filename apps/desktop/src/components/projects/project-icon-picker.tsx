import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";

import { ProjectIcon } from "./project-icon";
import {
  getProjectIconColor,
  getProjectIconValue,
  PROJECT_ICON_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  type ProjectIconColor,
  type ProjectIconValue,
} from "./project-icons";

interface ProjectIconPickerProps {
  color?: string | null;
  icon?: string | null;
  onChange: (next: { icon: ProjectIconValue; color: ProjectIconColor }) => void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: "sm" | "md" | "lg";
}

export function ProjectIconPicker({
  color,
  icon,
  onChange,
  triggerClassName,
  triggerLabel,
  triggerSize = "lg",
}: ProjectIconPickerProps) {
  const { t } = useLingui();
  const selectedIcon = getProjectIconValue(icon);
  const selectedColor = getProjectIconColor(color);
  const translatedTriggerLabel = triggerLabel ?? t`Change project icon`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-2xl transition-colors hover:bg-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            triggerClassName,
          )}
          aria-label={translatedTriggerLabel}
        >
          <ProjectIcon icon={selectedIcon} color={selectedColor} size={triggerSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-3">
          <div className="px-1">
            <div className="text-sm font-medium text-foreground">
              <Trans>Project icon</Trans>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              <Trans>Choose a simple marker for this project.</Trans>
            </p>
          </div>

          <div className="flex items-center gap-1 px-1" aria-label={t`Project icon color`}>
            {PROJECT_ICON_COLOR_OPTIONS.map(option => {
              const isSelected = option.value === selectedColor;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isSelected && "bg-surface-400",
                  )}
                  onClick={() => onChange({ icon: selectedIcon, color: option.value })}
                  aria-label={getProjectIconColorLabel(option.value, t)}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full ring-1 ring-border",
                      option.previewClassName,
                      isSelected && "ring-2 ring-offset-2 ring-offset-popover",
                      isSelected && option.ringClassName,
                    )}
                  />
                </button>
              );
            })}
          </div>

          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto p-1" aria-label={t`Project icons`}>
            {PROJECT_ICON_OPTIONS.map(option => {
              const isSelected = option.value === selectedIcon;

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-9 w-9 rounded-lg hover:bg-surface-400",
                    isSelected && "bg-surface-400 ring-1 ring-border",
                  )}
                  onClick={() => onChange({ icon: option.value, color: selectedColor })}
                  aria-label={getProjectIconLabel(option.value, t)}
                  aria-pressed={isSelected}
                >
                  <ProjectIcon
                    icon={option.value}
                    color={selectedColor}
                    size="picker"
                    className="ring-0"
                  />
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getProjectIconLabel(value: ProjectIconValue, t: ReturnType<typeof useLingui>["t"]) {
  switch (value) {
    case "ri-briefcase-4-line":
      return t`Client`;
    case "ri-file-list-3-line":
      return t`Notes`;
    case "ri-chat-3-line":
      return t`Conversation`;
    case "ri-lightbulb-line":
      return t`Idea`;
    case "ri-rocket-line":
      return t`Launch`;
    case "ri-customer-service-2-line":
      return t`Customer`;
    case "ri-team-line":
      return t`Team`;
    case "ri-user-smile-line":
      return t`Person`;
    case "ri-building-4-line":
      return t`Company`;
    case "ri-line-chart-line":
      return t`Growth`;
    case "ri-bar-chart-box-line":
      return t`Analytics`;
    case "ri-global-line":
      return t`Market`;
    case "ri-calendar-check-line":
      return t`Planning`;
    case "ri-flag-line":
      return t`Milestone`;
    case "ri-stack-line":
      return t`Stack`;
    case "ri-book-open-line":
      return t`Research`;
    case "ri-code-box-line":
      return t`Engineering`;
    case "ri-tools-line":
      return t`Tools`;
    case "ri-megaphone-line":
      return t`Marketing`;
    case "ri-shopping-bag-3-line":
      return t`Commercial`;
    case "ri-bank-line":
      return t`Finance`;
    case "ri-flask-line":
      return t`Experiment`;
    case "ri-shield-check-line":
      return t`Compliance`;
    case "ri-folder-3-line":
    default:
      return t`Folder`;
  }
}

function getProjectIconColorLabel(value: ProjectIconColor, t: ReturnType<typeof useLingui>["t"]) {
  switch (value) {
    case "ink":
      return t`Ink`;
    case "indigo":
      return t`Indigo`;
    case "blue":
      return t`Blue`;
    case "teal":
      return t`Teal`;
    case "violet":
      return t`Violet`;
    case "rose":
      return t`Rose`;
    case "amber":
      return t`Amber`;
    case "neutral":
    default:
      return t`Neutral`;
  }
}
