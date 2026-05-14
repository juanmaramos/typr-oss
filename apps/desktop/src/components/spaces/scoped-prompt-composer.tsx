import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLayoutEffect, useRef, useState } from "react";

interface ScopedPromptComposerProps {
  className?: string;
  helperText?: string;
  placeholder?: string;
  scopeLabel: string;
}

export function ScopedPromptComposer({
  className,
  helperText,
  placeholder,
  scopeLabel,
}: ScopedPromptComposerProps) {
  const { t } = useLingui();
  const resolvedHelperText = helperText ?? t`Project chat will use notes added here as context.`;
  const resolvedPlaceholder = placeholder ?? t`Ask about this project...`;
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [value]);

  return (
    <div
      className={cn(
        "rounded-[24px] border border bg-background p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground/80">
          <Trans>Ask Typr about this project</Trans>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border-[hsl(var(--sidebar-primary))]/15 bg-[hsl(var(--sidebar-accent))]/25 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--sidebar-primary))]"
        >
          <i className="ri-folder-3-line mr-1 text-[12px]" />
          {scopeLabel}
        </Badge>
      </div>

      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={resolvedPlaceholder}
        className="mt-2 min-h-[44px] w-full resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/70"
      />

      <div className="mt-1 flex items-center justify-between gap-3 border-t border/50 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">{resolvedHelperText}</span>
        </div>

        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  size="icon"
                  disabled
                  className="h-9 w-9 rounded-full bg-muted text-muted-foreground/70 hover:bg-surface-400"
                >
                  <i className="ri-arrow-up-line text-lg" />
                  <span className="sr-only">
                    <Trans>Send project question</Trans>
                  </span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <Trans>Project chat is coming next.</Trans>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
