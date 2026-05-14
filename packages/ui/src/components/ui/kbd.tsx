import { type ComponentProps, Fragment, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type KbdProps = ComponentProps<"span"> & {
  separator?: ReactNode;
  variant?: "default" | "outline" | "ghost";
};

const kbdVariants = {
  default: "border bg-muted px-1.5 text-muted-foreground shadow-sm",
  outline: "border border-border/40 bg-transparent px-1.5 text-muted-foreground/70",
  ghost: "border-0 bg-transparent px-1 text-muted-foreground/60",
};

export const Kbd = ({
  className,
  separator = null, // No separator by default - just spacing
  variant = "default",
  children,
  ...props
}: KbdProps) => {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 rounded align-middle font-medium font-mono text-[10px] leading-loose",
        kbdVariants[variant],
        className,
      )}
      {...props}
    >
      {Array.isArray(children)
        ? children.map((child, index) => (
          <Fragment key={index}>
            {child}
            {index < children.length - 1 && separator}
          </Fragment>
        ))
        : children}
    </span>
  );
};

export type KbdKeyProps = ComponentProps<"kbd">;

export const KbdKey = ({ className, ...props }: KbdKeyProps) => <kbd className={className} {...props} />;

// Convenience component for grouping multiple Kbd elements
export type KbdGroupProps = ComponentProps<"span">;

export const KbdGroup = ({ className, children, ...props }: KbdGroupProps) => (
  <span className={cn("inline-flex items-center gap-1", className)} {...props}>
    {children}
  </span>
);
