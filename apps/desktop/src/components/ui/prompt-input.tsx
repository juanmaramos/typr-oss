import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { debugLogFor } from "@/components/utils/debug-logger";
import { cn } from "@/lib/utils";
import { logAskLayoutDebug } from "@/utils/ask-layout-debug";
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { promptInputClassNames } from "./prompt-input-contracts";

type PromptInputContextType = {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  debugName?: string;
};

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  textareaRef: React.createRef<HTMLTextAreaElement>(),
  debugName: undefined,
});

function usePromptInput() {
  const context = useContext(PromptInputContext);
  if (!context) {
    throw new Error("usePromptInput must be used within a PromptInput");
  }
  return context;
}

type PromptInputProps = {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  debugName?: string;
};

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  debugName,
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <TooltipProvider>
      <PromptInputContext.Provider
        value={{
          isLoading,
          value: value ?? internalValue,
          setValue: onValueChange ?? handleChange,
          maxHeight,
          onSubmit,
          textareaRef,
          debugName,
        }}
      >
        <div
          className={cn(
            promptInputClassNames.root,
            className,
          )}
          onClick={(e) => {
            // Only focus textarea from direct clicks on the container, not from buttons/inputs
            if (
              !(e.target as HTMLElement).closest(
                "button, a, input, select, textarea, [role=\"button\"], [role=\"option\"]",
              )
            ) {
              textareaRef.current?.focus();
            }
          }}
        >
          {children}
        </div>
      </PromptInputContext.Provider>
    </TooltipProvider>
  );
}

export type PromptInputTextareaProps = {
  disableAutosize?: boolean;
  minHeight?: number | string;
} & React.ComponentProps<"textarea">;

function toCssSize(value: number | string) {
  return typeof value === "number" ? `${value}px` : value;
}

const logFloatingPromptInput = (event: string, payload: Record<string, unknown>) => {
  debugLogFor("DEBUG_FLOATING", "FloatingDebug", `prompt-input:${event}`, payload);
};

const PromptInputTextarea = React.forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(({
  className,
  onKeyDown,
  onBlur,
  onFocus,
  onPaste,
  disableAutosize = false,
  minHeight = 44,
  style,
  ...props
}, ref) => {
  const { value, setValue, maxHeight, onSubmit, disabled, textareaRef, debugName } = usePromptInput();
  const resolvedMaxHeight = typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;
  const resolvedMinHeight = toCssSize(minHeight);
  const lastFloatingMeasurementRef = useRef<
    {
      valueLength: number;
      height: number;
      overflowY: string;
    } | null
  >(null);

  useLayoutEffect(() => {
    if (disableAutosize) {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const minHeightPx = Number.parseFloat(computedStyle.minHeight) || 0;

    if (value.length === 0) {
      textarea.style.height = minHeightPx > 0 ? `${minHeightPx}px` : "auto";
      textarea.style.overflowY = "hidden";
      lastFloatingMeasurementRef.current = null;
      if (debugName === "ask") {
        logAskLayoutDebug("textarea:empty", {
          minHeightPx,
          width: Math.round(textarea.getBoundingClientRect().width),
        });
      }
      if (debugName === "floating-chat") {
        const rect = textarea.getBoundingClientRect();
        logFloatingPromptInput("textarea_empty", {
          minHeightPx,
          textareaHeight: Math.round(rect.height),
          textareaWidth: Math.round(rect.width),
          active: document.activeElement === textarea,
        });
      }
      return;
    }

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const max = typeof maxHeight === "number" ? maxHeight : scrollHeight;
    const clamped = Math.max(minHeightPx, Math.min(scrollHeight, max));
    textarea.style.height = `${clamped}px`;
    // Only show scrollbar when content exceeds maxHeight
    textarea.style.overflowY = scrollHeight > max ? "auto" : "hidden";
    if (debugName === "ask") {
      logAskLayoutDebug("textarea:autosize", {
        valueLength: value.length,
        scrollHeight,
        minHeightPx,
        maxHeight: max,
        clamped,
        clientHeight: textarea.clientHeight,
        offsetHeight: textarea.offsetHeight,
        width: Math.round(textarea.getBoundingClientRect().width),
        overflowY: textarea.style.overflowY,
      });
    }
    if (debugName === "floating-chat") {
      const last = lastFloatingMeasurementRef.current;
      const shouldLog = !last
        || last.height !== clamped
        || last.overflowY !== textarea.style.overflowY
        || Math.abs(last.valueLength - value.length) >= 250;

      if (shouldLog) {
        const rect = textarea.getBoundingClientRect();
        const parentRect = textarea.parentElement?.getBoundingClientRect();
        logFloatingPromptInput("textarea_autosize", {
          valueLength: value.length,
          scrollHeight,
          maxHeight: max,
          clamped,
          clientHeight: textarea.clientHeight,
          offsetHeight: textarea.offsetHeight,
          textareaWidth: Math.round(rect.width),
          textareaHeight: Math.round(rect.height),
          parentWidth: parentRect ? Math.round(parentRect.width) : null,
          parentHeight: parentRect ? Math.round(parentRect.height) : null,
          overflowY: textarea.style.overflowY,
          active: document.activeElement === textarea,
        });
        lastFloatingMeasurementRef.current = {
          valueLength: value.length,
          height: clamped,
          overflowY: textarea.style.overflowY,
        };
      }
    }
  }, [value, maxHeight, disableAutosize, minHeight, debugName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
    onKeyDown?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (debugName === "floating-chat") {
      const rect = e.currentTarget.getBoundingClientRect();
      logFloatingPromptInput("focus", {
        valueLength: value.length,
        textareaWidth: Math.round(rect.width),
        textareaHeight: Math.round(rect.height),
      });
    }
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (debugName === "floating-chat") {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      logFloatingPromptInput("blur", {
        valueLength: value.length,
        relatedTargetTag: relatedTarget?.tagName ?? null,
        relatedTargetRole: relatedTarget?.getAttribute("role") ?? null,
        activeElementTag: document.activeElement?.tagName ?? null,
      });
    }
    onBlur?.(e);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (debugName === "floating-chat") {
      logFloatingPromptInput("paste", {
        pastedLength: e.clipboardData.getData("text").length,
        valueLengthBefore: value.length,
        selectionStart: e.currentTarget.selectionStart,
        selectionEnd: e.currentTarget.selectionEnd,
      });
      window.setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        const rect = textarea.getBoundingClientRect();
        logFloatingPromptInput("paste_after_layout", {
          valueLength: textarea.value.length,
          scrollHeight: textarea.scrollHeight,
          clientHeight: textarea.clientHeight,
          textareaWidth: Math.round(rect.width),
          textareaHeight: Math.round(rect.height),
          overflowY: textarea.style.overflowY,
          active: document.activeElement === textarea,
        });
      }, 0);
    }
    onPaste?.(e);
  };

  // Merge the internal ref with the forwarded ref
  const mergedRef = (node: HTMLTextAreaElement) => {
    // Update internal ref
    if (textareaRef) {
      (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    }
    // Update forwarded ref
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  return (
    <textarea
      ref={mergedRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPaste={handlePaste}
      style={{
        ...style,
        minHeight: style?.minHeight ?? resolvedMinHeight,
        maxHeight: style?.maxHeight ?? resolvedMaxHeight,
      }}
      className={cn(
        "text-foreground w-full resize-none overflow-y-auto border-none bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      rows={1}
      disabled={disabled}
      {...props}
    />
  );
});

type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>;

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

type PromptInputActionProps = {
  className?: string;
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
} & React.ComponentProps<typeof Tooltip>;

function PromptInputAction({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInput();

  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled} onClick={event => event.stopPropagation()}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea };
