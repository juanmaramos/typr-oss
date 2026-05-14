import { cn } from "@/lib/utils";
import { useState } from "react";
import { Loader } from "./loader";

interface ToolPart {
  type: string;
  state: "pending" | "running" | "output-available" | "error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
}

interface ToolProps {
  toolPart: ToolPart;
  defaultOpen?: boolean;
  className?: string;
}

export function Tool({ toolPart, defaultOpen = false, className }: ToolProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { type, state, input, output, errorText } = toolPart;

  const getStateIcon = () => {
    switch (state) {
      case "pending":
        return <i className="ri-time-line text-muted-foreground" />;
      case "running":
        return <Loader variant="dots" size="sm" />;
      case "output-available":
        return <i className="ri-check-line text-success" />;
      case "error":
        return <i className="ri-error-warning-line text-destructive" />;
      default:
        return <i className="ri-cpu-line text-muted-foreground" />;
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "pending":
        return "text-muted-foreground";
      case "running":
        return "text-info";
      case "output-available":
        return "text-success";
      case "error":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const getStateText = () => {
    switch (state) {
      case "pending":
        return "Ready";
      case "running":
        return "Processing";
      case "output-available":
        return "Completed";
      case "error":
        return "Error";
      default:
        return "Unknown";
    }
  };

  const formatToolType = (type: string) => {
    // Convert camelCase or snake_case to readable format
    return type
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: unknown): string => {
    if (typeof value === "string") {
      return value.length > 100 ? `${value.slice(0, 100)}...` : value;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-card", className)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between hover:bg-surface-400/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {getStateIcon()}
          <span className="text-sm font-medium text-foreground">
            {formatToolType(type)}
          </span>
          <span className={cn("text-xs font-medium", getStateColor())}>
            {getStateText()}
          </span>
        </div>
        <i
          className={cn(
            "ri-arrow-down-s-line text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Expandable Content */}
      {isOpen && (
        <div className="px-4 py-3 space-y-3">
          {/* Input */}
          {input && Object.keys(input).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Input:</h4>
              <div className="text-sm bg-muted/50 rounded p-3 font-mono">
                {Object.entries(input).map(([key, value]) => (
                  <div key={key} className="mb-1 last:mb-0">
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span className="text-foreground">
                      {formatValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Output */}
          {state === "output-available" && output && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Output:</h4>
              <div className="text-sm bg-success/5 border border-success/20 rounded p-3">
                {typeof output === "object" && output !== null
                  ? (
                    Object.entries(output).map(([key, value]) => (
                      <div key={key} className="mb-1 last:mb-0">
                        <span className="text-success font-medium">{key}:</span>{" "}
                        <span className="text-success/80">
                          {formatValue(value)}
                        </span>
                      </div>
                    ))
                  )
                  : (
                    <div className="text-success">
                      {formatValue(output)}
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Error */}
          {state === "error" && errorText && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Error:</h4>
              <div className="text-sm bg-destructive/5 border border-destructive/20 rounded p-3 text-destructive">
                {errorText}
              </div>
            </div>
          )}

          {/* Running state */}
          {state === "running" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader variant="typing" size="sm" />
              <span>Processing request...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
