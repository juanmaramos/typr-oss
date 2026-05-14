import { cn } from "@typr/ui/lib/utils";

interface RecordingIndicatorProps {
  className?: string;
  size?: "sm" | "default";
}

export function RecordingIndicator({ className, size = "default" }: RecordingIndicatorProps) {
  return (
    <div
      className={cn(
        "relative",
        size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
        className,
      )}
    >
      <div className="absolute inset-0 rounded-full bg-destructive" />
      <div className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
    </div>
  );
}
