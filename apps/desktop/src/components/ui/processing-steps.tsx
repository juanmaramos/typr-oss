import { cn } from "@/lib/utils";
import { useState } from "react";
import { Loader } from "./loader";

interface ProcessingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "error";
}

interface ProcessingStepsProps {
  steps: ProcessingStep[];
  className?: string;
}

export function ProcessingSteps({ steps, className }: ProcessingStepsProps) {
  const completedCount = steps.filter(step => step.status === "completed").length;

  return (
    <div className={cn("space-y-2 p-3 bg-muted/20 rounded-lg border", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <i className="ri-cpu-line text-base" />
        <span>AI Processing</span>
        <span className="text-xs">
          ({completedCount}/{steps.length})
        </span>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 text-sm transition-all duration-200",
              step.status === "active" && "text-foreground",
              step.status === "completed" && "text-muted-foreground",
              step.status === "pending" && "text-muted-foreground/60",
              step.status === "error" && "text-destructive",
            )}
          >
            {/* Status Icon */}
            <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {step.status === "completed" && <i className="ri-check-line text-primary text-sm" />}
              {step.status === "active" && <Loader variant="dots" size="sm" className="w-4 h-4" />}
              {step.status === "pending" && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />}
              {step.status === "error" && <i className="ri-error-warning-line text-destructive text-sm" />}
            </div>

            {/* Step Label */}
            <span
              className={cn(
                "transition-all duration-200",
                step.status === "active" && "font-medium",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useProcessingSteps(initialSteps: Omit<ProcessingStep, "status">[]) {
  const [steps, setSteps] = useState<ProcessingStep[]>(
    initialSteps.map(step => ({ ...step, status: "pending" as const })),
  );

  const updateStep = (id: string, status: ProcessingStep["status"]) => {
    setSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  const startProcessing = async () => {
    for (const step of steps) {
      updateStep(step.id, "active");
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate processing time (remove in production)
      await new Promise(resolve => setTimeout(resolve, 800));

      updateStep(step.id, "completed");
    }
  };

  return { steps, updateStep, startProcessing };
}
