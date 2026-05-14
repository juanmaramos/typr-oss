import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

const buttonGroupVariants = cva(
  "inline-flex items-center justify-center",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

const buttonGroupItemVariants = cva(
  "",
  {
    variants: {
      orientation: {
        horizontal: "first:rounded-r-none last:rounded-l-none [&:not(:first-child):not(:last-child)]:rounded-none",
        vertical: "first:rounded-b-none last:rounded-t-none [&:not(:first-child):not(:last-child)]:rounded-none",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof buttonGroupVariants>
{
  asChild?: boolean;
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        className={cn(buttonGroupVariants({ orientation }), className)}
        role="group"
        data-orientation={orientation}
        {...props}
      />
    );
  },
);
ButtonGroup.displayName = "ButtonGroup";

export interface ButtonGroupSeparatorProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof buttonGroupVariants>
{
  orientation?: "horizontal" | "vertical";
}

const ButtonGroupSeparator = React.forwardRef<
  HTMLDivElement,
  ButtonGroupSeparatorProps
>(({ className, orientation = "vertical", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-border",
      orientation === "vertical" ? "w-[1px] h-full" : "h-[1px] w-full",
      className,
    )}
    {...props}
  />
));
ButtonGroupSeparator.displayName = "ButtonGroupSeparator";

export interface ButtonGroupTextProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

const ButtonGroupText = React.forwardRef<HTMLDivElement, ButtonGroupTextProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
ButtonGroupText.displayName = "ButtonGroupText";

export { ButtonGroup, buttonGroupItemVariants, ButtonGroupSeparator, ButtonGroupText };
