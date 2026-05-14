import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        "gradient-outline": "border-none text-foreground p-0",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, size, ...props }, ref) => {
  return <div ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />;
});
Badge.displayName = "Badge";

/**
 * GradientBadge - Linear-inspired gradient outline badge
 * Uses your existing color system (sidebar-primary → info) for a professional gradient
 * Works automatically in both light and dark modes
 */
const GradientBadge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, children, size, ...props }, ref) => {
    return (
      <div className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[hsl(var(--sidebar-primary))] to-[hsl(var(--info))] p-[1px]">
        <Badge
          ref={ref}
          variant="gradient-outline"
          size={size}
          className={cn("bg-background hover:bg-background", className)}
          {...props}
        >
          {children}
        </Badge>
      </div>
    );
  },
);
GradientBadge.displayName = "GradientBadge";

export { Badge, badgeVariants, GradientBadge };
