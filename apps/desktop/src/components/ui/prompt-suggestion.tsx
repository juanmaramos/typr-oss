import { cn } from "@/lib/utils";
import { Button } from "@typr/ui/components/ui/button";
import * as React from "react";

interface PromptSuggestionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Text to highlight within the children content
   * When provided, enables highlight mode
   */
  highlight?: string;
  /**
   * Visual variant of the button
   */
  variant?: "default" | "destructive" | "success" | "warning" | "info" | "outline" | "secondary" | "ghost" | "link";
  /**
   * Size of the button
   */
  size?: "sm" | "lg" | "icon";
}

export function PromptSuggestion({
  className,
  children,
  highlight,
  variant = highlight ? "ghost" : "outline",
  size = highlight ? "sm" : "sm", // Default to smaller size
  ...props
}: PromptSuggestionProps) {
  // Regular suggestion mode (no highlight)
  if (!highlight) {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn(
          "text-xs px-2 py-1 h-6 rounded-full border-border/60 hover:bg-surface-400 hover:text-foreground transition-colors",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    );
  }

  // Highlight mode
  const content = React.useMemo(() => {
    if (typeof children !== "string") {
      return children;
    }

    const regex = new RegExp(`(${highlight})`, "gi");
    const parts = children.split(regex);

    return parts.map((part, i) => {
      if (part.toLowerCase() === highlight.toLowerCase()) {
        return (
          <span key={i} className="bg-primary/10 text-primary">
            {part}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }, [children, highlight]);

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "text-xs text-left justify-start px-2 py-1 h-6 font-normal",
        className,
      )}
      {...props}
    >
      {content}
    </Button>
  );
}
