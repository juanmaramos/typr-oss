"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@typr/ui/components/ui/badge";
import type { ReactNode } from "react";

interface TabProps {
  text: string;
  value: string;
  selected: boolean;
  onSelect: (value: string) => void;
  iconClassName?: string;
  trailing?: ReactNode;
  discount?: boolean;
  badgeText?: string;
  showRecordingIndicator?: boolean;
  variant?: "line" | "solid";
}

export function Tab({
  text,
  value,
  selected,
  onSelect,
  iconClassName,
  trailing,
  discount = false,
  badgeText,
  showRecordingIndicator = false,
  variant = "line",
}: TabProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "relative flex items-center gap-2 text-sm font-medium capitalize transition-colors duration-200",
        variant === "line" && "min-h-[40px] -mb-px border-b-2 border-transparent px-0 py-2.5",
        variant === "line" && (
          selected
            ? "border-foreground text-foreground"
            : "text-muted-foreground hover:border-border hover:text-foreground"
        ),
        variant === "solid" && "min-h-[32px] rounded-lg px-3 py-2",
        variant === "solid" && (
          selected
            ? "border border-border bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
        ),
        discount && "justify-center",
      )}
    >
      {iconClassName && <i className={cn(iconClassName, "relative z-10 text-base")} />}
      <span className="relative z-10">{text}</span>
      {trailing && <span className="relative z-10">{trailing}</span>}

      {/* Recording indicator with pulsing animation - matches Live indicator */}
      {showRecordingIndicator && (
        <div className="relative w-1.5 h-1.5 z-10">
          <div className="absolute inset-0 rounded-full bg-destructive" />
          <div className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75" />
        </div>
      )}

      {/* Badge for additional context */}
      {(discount || badgeText) && (
        <Badge
          variant="secondary"
          className={cn(
            "relative z-10 whitespace-nowrap shadow-none text-xs px-1.5 py-0.5 rounded-full min-w-[16px] text-center",
            selected ? "bg-muted/60" : "bg-muted",
          )}
        >
          {badgeText || "Save 35%"}
        </Badge>
      )}
    </button>
  );
}
