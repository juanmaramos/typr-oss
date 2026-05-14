import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        success: "border-transparent bg-success text-success-foreground hover:bg-success/80",
        warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning/80",
        info: "border-transparent bg-info text-info-foreground hover:bg-info/80",
        outline: "text-foreground",
        "gradient-outline": "border-none text-foreground p-0",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
      disabled: {
        true: "opacity-50 cursor-not-allowed pointer-events-none",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      disabled: false,
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  label?: string;
}

export interface NumberBadgeProps extends BadgeProps {
  value?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({
  className,
  variant,
  size,
  disabled,
  label,
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant, size, disabled }), className)}
      aria-label={label}
      role="status"
      {...props}
    >
      {children}
    </div>
  );
});
Badge.displayName = "Badge";

const NumberBadge = React.forwardRef<HTMLDivElement, NumberBadgeProps>(({
  className,
  variant = "secondary",
  size,
  disabled,
  value,
  children,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        badgeVariants({ variant, size, disabled }),
        "h-5 min-w-5 justify-center px-1.5 py-0 text-[11px] font-medium tabular-nums",
        className,
      )}
      {...props}
    >
      {value ?? children}
    </div>
  );
});
NumberBadge.displayName = "NumberBadge";

/**
 * GradientBadge - Linear-inspired gradient outline badge
 * Uses your existing color system (sidebar-primary → info) for a professional gradient
 * Works automatically in both light and dark modes
 */
const GradientBadge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, children, size, disabled, ...props }, ref) => {
    return (
      <div className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[hsl(var(--sidebar-primary))] to-[hsl(var(--info))] p-[1px]">
        <Badge
          ref={ref}
          variant="gradient-outline"
          size={size}
          disabled={disabled}
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

export { Badge, badgeVariants, GradientBadge, NumberBadge };
