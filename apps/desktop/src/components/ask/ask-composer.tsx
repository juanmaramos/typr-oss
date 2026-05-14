import { ModelSelector } from "@/components/ui/model-selector";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { promptInputClassNames, promptTextareaContracts } from "@/components/ui/prompt-input-contracts";
import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { ArrowUpIcon } from "lucide-react";

interface AskComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  layout?: "project" | "dock";
  className?: string;
}

export function AskComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  disabled = false,
  isSubmitting = false,
  layout = "project",
  className,
}: AskComposerProps) {
  const { t } = useLingui();
  const isDock = layout === "dock";

  return (
    <PromptInput
      value={value}
      onValueChange={onValueChange}
      onSubmit={onSubmit}
      isLoading={isSubmitting}
      maxHeight={isDock ? 160 : 96}
      debugName="ask"
      className={cn(
        "transition-colors hover:border-border",
        isDock ? promptInputClassNames.floatingDockSurface : promptInputClassNames.projectInlineSurface,
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div className={cn("flex", isDock ? "items-end gap-3" : "items-center gap-2")}>
        <PromptInputTextarea
          minHeight={isDock
            ? promptTextareaContracts.floatingDock.minHeight
            : promptTextareaContracts.projectInline.minHeight}
          placeholder={placeholder}
          className={cn(
            "min-w-0 flex-1",
            isDock ? promptTextareaContracts.floatingDock.className : promptTextareaContracts.projectInline.className,
          )}
          disabled={disabled || isSubmitting}
        />

        <PromptInputActions className={cn("ml-auto shrink-0 gap-1", isDock && "self-end")}>
          <ModelSelector compact className={cn(isDock ? "h-8" : "h-7", "px-2 gap-1.5")} />
          <PromptInputAction tooltip={t`Send message`} side="top">
            <Button
              type="button"
              variant="default"
              size="icon"
              onClick={onSubmit}
              disabled={!value.trim() || disabled || isSubmitting}
              className={cn(isDock ? "h-9 w-9" : "h-8 w-8", "shrink-0 rounded-full p-0")}
            >
              <ArrowUpIcon className={cn(isDock ? "h-4 w-4" : "h-3.5 w-3.5", "text-primary-foreground")} />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </div>
    </PromptInput>
  );
}
