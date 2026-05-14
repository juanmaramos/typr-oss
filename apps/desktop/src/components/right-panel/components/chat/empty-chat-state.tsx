import { AnimatedIconDisplay, BUTTON_VARIANTS, CONTENT_VARIANTS } from "@/components/ui/animated-icon-display";
import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { motion } from "motion/react";
import { memo, useCallback } from "react";

interface EmptyChatStateProps {
  onQuickAction: (prompt: string) => void;
  onFocusInput: () => void;
  layout?: "sidebar" | "floating";
}

export const EmptyChatState = memo(({ onQuickAction, onFocusInput, layout = "sidebar" }: EmptyChatStateProps) => {
  const { t } = useLingui();

  const QUICK_ACTIONS = [
    {
      label: t`Summarize meeting`,
      prompt: t`Summarize this meeting`,
    },
    {
      label: t`Key decisions`,
      prompt: t`Identify key decisions made in this meeting`,
    },
    {
      label: t`Extract action items`,
      prompt: t`Extract action items from this meeting`,
    },
    {
      label: t`Follow-up items`,
      prompt: t`What follow-up items came out of this meeting`,
    },
  ];

  const handleContainerClick = useCallback(() => {
    onFocusInput();
  }, [onFocusInput]);

  const handleButtonClick = useCallback((prompt: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickAction(prompt);
  }, [onQuickAction]);

  return (
    <motion.div
      className={cn(
        "group flex-1 flex flex-col items-center justify-center h-full text-center bg-background",
        layout === "floating" ? "px-6 py-6" : "px-8 py-12",
      )}
      onClick={handleContainerClick}
      initial="initial"
      animate="animate"
      whileHover="hover"
    >
      {/* Animated Icons */}
      <div className={layout === "floating" ? "mb-4 scale-90" : "mb-6"}>
        <AnimatedIconDisplay
          icons={[
            <i className="ri-lightbulb-line text-lg" />,
            <i className="ri-chat-smile-2-line text-lg" />,
            <i className="ri-sparkling-2-line text-lg" />,
          ]}
        />
      </div>

      {/* Header */}
      <motion.div variants={CONTENT_VARIANTS} className={layout === "floating" ? "mb-2" : "mb-3"}>
        <div className={cn("flex items-center justify-center gap-3", layout === "floating" ? "mb-1.5" : "mb-2")}>
          <h2 className={cn("font-semibold text-foreground", layout === "floating" ? "text-[17px]" : "text-lg")}>
            <Trans>Start a conversation</Trans>
          </h2>
        </div>
        <p
          className={cn(
            "text-muted-foreground leading-relaxed",
            layout === "floating" ? "max-w-[320px] text-[13px]" : "max-w-[280px] text-sm",
          )}
        >
          <Trans>
            Ask questions about your meeting or try one of these suggestions to get started.
          </Trans>
        </p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        variants={BUTTON_VARIANTS}
        className={cn(
          "flex flex-wrap justify-center gap-2 w-full",
          layout === "floating" ? "max-w-[340px]" : "max-w-[280px]",
        )}
      >
        {QUICK_ACTIONS.map((action, index) => (
          <Button
            key={index}
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(action.prompt)}
            className={cn(
              "font-medium bg-surface-300 text-muted-foreground border-0 hover:bg-surface-300 hover:text-primary transition-colors justify-center whitespace-nowrap flex-shrink-0",
              layout === "floating" ? "h-7 min-w-[124px] px-3 py-1 text-[12px]" : "h-6 min-w-[110px] px-2 py-1 text-xs",
            )}
          >
            {action.label}
          </Button>
        ))}
      </motion.div>

      {/* Helper Text */}
      <motion.p
        variants={BUTTON_VARIANTS}
        className={cn("text-xs text-muted-foreground/70", layout === "floating" ? "mt-4" : "mt-6")}
      >
        <Trans>Click anywhere to start typing your question</Trans>
      </motion.p>
    </motion.div>
  );
});
