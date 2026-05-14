import { cn } from "@typr/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";

interface ProjectBriefBuildingStatusProps {
  className?: string;
  label?: string;
}

export function ProjectBriefBuildingStatus({ className, label }: ProjectBriefBuildingStatusProps) {
  const { t } = useLingui();
  const displayLabel = label ?? t`Building`;

  return (
    <span
      role="status"
      aria-label={displayLabel}
      className={cn(
        "inline-flex h-5 items-center rounded-full border border-border/70 bg-background/70 px-2 text-xs font-medium",
        className,
      )}
    >
      <span
        className={cn(
          "bg-[linear-gradient(to_right,hsl(var(--muted-foreground))_35%,hsl(var(--foreground))_50%,hsl(var(--muted-foreground))_65%)]",
          "animate-[shimmer-text_2s_infinite_linear] bg-[length:200%_auto] bg-clip-text text-transparent",
        )}
      >
        {displayLabel}
      </span>
    </span>
  );
}
