import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/utils";

type ThinkingBarProps = {
  className?: string;
  text?: string;
  onStop?: () => void;
  stopLabel?: string;
  onClick?: () => void;
};

export function ThinkingBar({
  className,
  text,
  onStop,
  stopLabel,
  onClick,
}: ThinkingBarProps) {
  const { t } = useLingui();
  const label = text ?? t`Thinking`;
  const actionLabel = stopLabel ?? t`Answer now`;

  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {onClick
        ? (
          <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
          >
            <span
              className={cn(
                "bg-[linear-gradient(to_right,hsl(var(--muted-foreground))_40%,hsl(var(--foreground))_60%,hsl(var(--muted-foreground))_80%)]",
                "bg-[length:200%_auto] bg-clip-text text-transparent animate-[shimmer-text_2s_infinite_linear]",
                "font-medium",
              )}
            >
              {label}
            </span>
            <i className="ri-arrow-right-s-line text-base text-muted-foreground" />
          </button>
        )
        : (
          <span
            className={cn(
              "cursor-default bg-[linear-gradient(to_right,hsl(var(--muted-foreground))_40%,hsl(var(--foreground))_60%,hsl(var(--muted-foreground))_80%)]",
              "bg-[length:200%_auto] bg-clip-text text-transparent animate-[shimmer-text_2s_infinite_linear]",
              "text-sm font-medium",
            )}
          >
            {label}
          </span>
        )}
      {onStop
        ? (
          <button
            type="button"
            onClick={onStop}
            className="border-b border-dotted border-muted-foreground/50 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            {actionLabel}
          </button>
        )
        : null}
    </div>
  );
}
