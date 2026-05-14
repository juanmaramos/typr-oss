import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { memo, type ReactNode } from "react";

const ICON_VARIANTS = {
  left: {
    initial: { scale: 0.8, opacity: 0, x: 0, y: 0, rotate: 0 },
    animate: { scale: 1, opacity: 1, x: 0, y: 0, rotate: -6, transition: { duration: 0.4, delay: 0.1 } },
    hover: { x: -22, y: -5, rotate: -15, scale: 1.1, transition: { duration: 0.2 } },
  },
  center: {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1, transition: { duration: 0.4, delay: 0.2 } },
    hover: { y: -10, scale: 1.15, transition: { duration: 0.2 } },
  },
  right: {
    initial: { scale: 0.8, opacity: 0, x: 0, y: 0, rotate: 0 },
    animate: { scale: 1, opacity: 1, x: 0, y: 0, rotate: 6, transition: { duration: 0.4, delay: 0.3 } },
    hover: { x: 22, y: -5, rotate: 15, scale: 1.1, transition: { duration: 0.2 } },
  },
} as const;

type Variant = keyof typeof ICON_VARIANTS;

const IconContainer = memo(({ children, variant, className }: {
  children: ReactNode;
  variant: Variant;
  className?: string;
}) => (
  <motion.div
    variants={ICON_VARIANTS[variant]}
    className={cn(
      "w-11 h-11 rounded-xl flex items-center justify-center relative",
      "bg-background border border/80 shadow-sm",
      "transition-shadow duration-300 group-hover:shadow-md group-hover:border/80",
      className,
    )}
  >
    <div className="text-muted-foreground/70 group-hover:text-muted-foreground transition-colors duration-300">
      {children}
    </div>
  </motion.div>
));
IconContainer.displayName = "IconContainer";

export const AnimatedIconDisplay = memo(({ icons }: { icons: [ReactNode, ReactNode, ReactNode] }) => (
  <div className="flex justify-center isolate relative">
    <IconContainer variant="left" className="left-2 top-1 z-10">
      {icons[0]}
    </IconContainer>
    <IconContainer variant="center" className="z-20">
      {icons[1]}
    </IconContainer>
    <IconContainer variant="right" className="right-2 top-1 z-10">
      {icons[2]}
    </IconContainer>
  </div>
));
AnimatedIconDisplay.displayName = "AnimatedIconDisplay";

export const CONTENT_VARIANTS = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.2 } },
};

export const BUTTON_VARIANTS = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.3 } },
};
