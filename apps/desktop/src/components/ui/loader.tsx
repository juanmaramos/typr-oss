import { cn } from "@/lib/utils";

export type LoaderProps = {
  variant?: "circular" | "classic" | "pulse" | "pulse-dot" | "dots" | "typing" | "wave" | "bars" | "text-shimmer";
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
};

export function Loader({
  variant = "typing", // Default to typing animation as requested
  size = "md",
  text,
  className,
}: LoaderProps) {
  // Size mappings for different variants
  const sizes = {
    sm: {
      container: "h-4",
      dot: "h-1 w-1",
      space: "space-x-1",
      text: "text-xs",
    },
    md: {
      container: "h-5",
      dot: "h-1.5 w-1.5",
      space: "space-x-1.5",
      text: "text-sm",
    },
    lg: {
      container: "h-6",
      dot: "h-2 w-2",
      space: "space-x-2",
      text: "text-base",
    },
  };

  // Render different loader variants
  if (variant === "typing") {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5",
          sizes[size].container,
          className,
        )}
      >
        <div className="flex items-end gap-1">
          <div
            className={`${sizes[size].dot} rounded-full bg-current animate-[typing_1s_infinite]`}
            style={{ animationDelay: "0.1s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} rounded-full bg-current animate-[typing_1s_infinite]`}
            style={{ animationDelay: "0.2s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} rounded-full bg-current animate-[typing_1s_infinite]`}
            style={{ animationDelay: "0.3s" }}
          >
          </div>
        </div>
        {text && <span className={cn("text-muted-foreground", sizes[size].text)}>{text}</span>}
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5",
          sizes[size].container,
          className,
        )}
      >
        <div className={cn("flex", sizes[size].space)}>
          <div
            className={`${sizes[size].dot} rounded-full bg-current opacity-60 animate-[bounce-dots_1.4s_infinite]`}
            style={{ animationDelay: "0.1s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} rounded-full bg-current opacity-60 animate-[bounce-dots_1.4s_infinite]`}
            style={{ animationDelay: "0.2s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} rounded-full bg-current opacity-60 animate-[bounce-dots_1.4s_infinite]`}
            style={{ animationDelay: "0.3s" }}
          >
          </div>
        </div>
        {text && <span className={cn("text-muted-foreground", sizes[size].text)}>{text}</span>}
      </div>
    );
  }

  if (variant === "wave") {
    const barWidths = {
      sm: "w-0.5",
      md: "w-0.5",
      lg: "w-1",
    };

    const containerSizes = {
      sm: "h-4",
      md: "h-5",
      lg: "h-6",
    };

    const heights = {
      sm: ["6px", "9px", "12px", "9px", "6px"],
      md: ["8px", "12px", "16px", "12px", "8px"],
      lg: ["10px", "15px", "20px", "15px", "10px"],
    };

    return (
      <div
        className={cn(
          "flex items-center gap-1.5",
          containerSizes[size],
          className,
        )}
      >
        <div className="flex items-center gap-0.5">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "bg-current animate-[wave_1s_ease-in-out_infinite] rounded-full",
                barWidths[size],
              )}
              style={{
                animationDelay: `${i * 100}ms`,
                height: heights[size][i],
              }}
            />
          ))}
        </div>
        {text && <span className={cn("text-muted-foreground", sizes[size].text)}>{text}</span>}
      </div>
    );
  }

  if (variant === "bars") {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5",
          sizes[size].container,
          className,
        )}
      >
        <div className={cn("flex items-end", sizes[size].space)}>
          <div
            className={`${sizes[size].dot} w-[3px] bg-current animate-[wave-bars_1.2s_ease-in-out_infinite]`}
            style={{ animationDelay: "0s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} w-[3px] bg-current animate-[wave-bars_1.2s_ease-in-out_infinite]`}
            style={{ animationDelay: "0.1s" }}
          >
          </div>
          <div
            className={`${sizes[size].dot} w-[3px] bg-current animate-[wave-bars_1.2s_ease-in-out_infinite]`}
            style={{ animationDelay: "0.2s" }}
          >
          </div>
        </div>
        {text && <span className={cn("text-muted-foreground", sizes[size].text)}>{text}</span>}
      </div>
    );
  }

  if (variant === "text-shimmer") {
    return (
      <div
        className={cn(
          "bg-[linear-gradient(to_right,var(--muted-foreground)_40%,var(--foreground)_60%,var(--muted-foreground)_80%)]",
          "bg-[length:200%_auto] bg-clip-text text-transparent",
          "animate-[shimmer-text_2s_infinite_linear]",
          sizes[size].text,
          className,
        )}
      >
        {text || "Loading..."}
      </div>
    );
  }

  // Default to circular loader if no match
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        sizes[size].container,
        className,
      )}
    >
      <div className="animate-spin text-muted-foreground">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M14 8.00002C14 4.68629 11.3137 2.00002 8 2.00002C4.68629 2.00002 2 4.68629 2 8.00002C2 11.3137 4.68629 14 8 14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {text && <span className={cn("text-muted-foreground", sizes[size].text)}>{text}</span>}
    </div>
  );
}
