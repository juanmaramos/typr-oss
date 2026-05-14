import React, { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

export type ResponsiveDisplayMode = "full" | "compact" | "icon";

export interface ResponsiveIconButtonProps {
  icon: React.ElementType;
  text: string;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  displayMode?: ResponsiveDisplayMode;
  disabled?: boolean;
  [key: string]: any;
}

export function ResponsiveIconButton({
  icon: Icon,
  text,
  onClick,
  className,
  variant = "ghost",
  size = "sm",
  displayMode,
  disabled,
  ...props
}: ResponsiveIconButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentMode, setCurrentMode] = useState<ResponsiveDisplayMode>(displayMode || "full");

  useEffect(() => {
    if (displayMode) {
      setCurrentMode(displayMode);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;

      if (width < 200) {
        setCurrentMode("icon");
      } else if (width < 300) {
        setCurrentMode("compact");
      } else {
        setCurrentMode("full");
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [displayMode]);

  const compactText = text.split(" ")[0];

  return (
    <div ref={containerRef} className="inline-block">
      <Button
        variant={variant}
        size={size === "md" ? "default" : size}
        onClick={onClick}
        className={`flex items-center gap-1.5 ${className || ""}`}
        title={currentMode === "icon" ? text : undefined}
        disabled={disabled}
        {...props}
      >
        <Icon className="w-3 h-3 flex-shrink-0" />
        {currentMode !== "icon" && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {currentMode === "compact" ? compactText : text}
          </span>
        )}
      </Button>
    </div>
  );
}
