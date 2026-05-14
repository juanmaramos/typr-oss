import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import * as React from "react";

interface MessageActionProps {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}

export function MessageAction({
  tooltip,
  children,
  className,
  side = "top",
  disabled = false,
  ...props
}: MessageActionProps & React.ComponentProps<typeof Tooltip>) {
  return (
    <TooltipProvider>
      <Tooltip {...props}>
        <TooltipTrigger asChild disabled={disabled}>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side} className={className}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MessageActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function MessageActions({
  children,
  className,
  ...props
}: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex justify-end items-center gap-2 mt-1",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
