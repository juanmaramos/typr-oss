import type { ReactNode } from "react";

import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@typr/ui/components/ui/dialog";
import { cn } from "@typr/ui/lib/utils";

interface OnboardingLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  stepIndicator?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  footerNote?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function OnboardingLayout({
  title,
  description,
  stepIndicator,
  children,
  footer,
  footerNote,
  className,
  bodyClassName,
}: OnboardingLayoutProps) {
  return (
    <div className={cn("w-full max-w-md mx-auto", className)}>
      {stepIndicator && (
        <div className="mb-5 flex justify-center">
          {stepIndicator}
        </div>
      )}

      <DialogHeader className="text-center sm:text-center">
        <DialogTitle className="text-lg leading-7">{title}</DialogTitle>
        {description && (
          <DialogDescription className="mx-auto max-w-sm leading-6">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>

      {children && (
        <div className={cn("mt-6", bodyClassName)}>
          {children}
        </div>
      )}

      {footer && (
        <DialogFooter className="mt-6 flex-col gap-3 sm:flex-col sm:justify-start sm:space-x-0">
          {footer}
          {footerNote && (
            <p className="text-center text-xs text-muted-foreground">
              {footerNote}
            </p>
          )}
        </DialogFooter>
      )}
    </div>
  );
}
