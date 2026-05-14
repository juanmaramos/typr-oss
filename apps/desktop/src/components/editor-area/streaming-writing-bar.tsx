import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

type WritingBarState = "analyzing" | "writing" | "cancelling";

interface StreamingWritingBarProps {
  state: WritingBarState;
}

// Loading dots animation
function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60" style={{ animationDelay: "0s" }}>
        .
      </span>
      <span className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60" style={{ animationDelay: "0.2s" }}>
        .
      </span>
      <span className="animate-[loading-dots_1.4s_ease-in-out_infinite] opacity-60" style={{ animationDelay: "0.4s" }}>
        .
      </span>
    </span>
  );
}

// Typing loader (3 animated dots)
function TypingLoader({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-1", className)}>
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.1s" }}
      />
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.2s" }}
      />
      <div
        className="h-1 w-1 rounded-full bg-current animate-[typing_1s_infinite]"
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );
}

export function StreamingWritingBar({ state }: StreamingWritingBarProps) {
  const getBarStyles = () => {
    switch (state) {
      case "cancelling":
        return {
          bg: "bg-destructive/10 dark:bg-destructive/20",
          text: "text-destructive",
          loaderColor: "text-destructive",
        };
      case "analyzing":
      case "writing":
      default:
        return {
          bg: "bg-primary/10 dark:bg-primary/20 border border-primary/20",
          text: "text-foreground",
          loaderColor: "text-primary",
        };
    }
  };

  const getMessageText = () => {
    switch (state) {
      case "analyzing":
        return "Analyzing transcript";
      case "writing":
        return "Writing summary";
      case "cancelling":
        return "Cancelled";
      default:
        return "Analyzing transcript";
    }
  };

  const styles = getBarStyles();
  const message = getMessageText();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn("mx-8 mb-4 rounded-md p-3", styles.bg)}
      >
        <div className="flex items-center gap-3">
          {state !== "cancelling" && <TypingLoader className={styles.loaderColor} />}

          <div className="flex-1">
            <span className={cn("text-sm font-medium", styles.text)}>
              {message}
              {state !== "cancelling" && <LoadingDots />}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
