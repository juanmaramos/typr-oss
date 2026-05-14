import { cn } from "@typr/ui/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full transition-all duration-300",
            i + 1 === currentStep
              ? "bg-primary w-6" // Active step is wider
              : i + 1 < currentStep
              ? "bg-primary/60" // Completed steps
              : "bg-muted", // Upcoming steps
          )}
        />
      ))}
    </div>
  );
}
