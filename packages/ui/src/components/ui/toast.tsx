import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { useTheme } from "next-themes";
import React from "react";
import { toast as sonnerToast, Toaster as Sonner } from "sonner";

import { cn } from "../../lib/utils";

export { sonnerToast };

const DEFAULT_TOAST_DURATION_MS = 5000;

export interface ToastButtonProps {
  label: React.ReactNode; // Changed from string to ReactNode to support <Trans>
  onClick: () => void;
  primary?: boolean;
}

export interface CustomToastProps {
  id: string | number;
  title: React.ReactNode; // Changed from string to ReactNode to support <Trans>
  content?: React.ReactNode;
  buttons?: ToastButtonProps[];
  dismissible?: boolean;
  children?: React.ReactNode;
  duration?: number;
}

export function CustomToast(props: CustomToastProps) {
  const { t } = useLingui();
  const { id, title, content, buttons = [], dismissible, children } = props;

  return (
    <div className="relative flex flex-col gap-2 rounded-surface border-0 bg-background p-4 text-foreground shadow-md">
      {dismissible && (
        <button
          onClick={() => sonnerToast.dismiss(id)}
          className="cursor-pointer absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
          aria-label={t`Dismiss`}
        >
          <X size={16} />
        </button>
      )}

      <div className="text-sm font-medium">{title}</div>

      {content && <div className="text-sm text-muted-foreground">{content}</div>}

      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {buttons.map((button, index) => (
            <button
              key={index}
              onClick={() => {
                button.onClick();
                sonnerToast.dismiss(id);
              }}
              className={cn(
                "max-w-full flex-auto shrink-0 whitespace-normal break-normal px-3 py-1.5 text-sm rounded-control",
                button.primary
                  ? "bg-foreground/80 text-background hover:bg-foreground/60"
                  : "bg-secondary text-foreground hover:bg-surface-400",
              )}
            >
              {button.label}
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

export function toast(props: CustomToastProps) {
  return sonnerToast.custom(
    (id) => (
      <div className="group w-[300px] overflow-clip rounded-surface">
        <CustomToast
          id={id}
          title={props.title}
          content={props.content}
          buttons={props.buttons}
          dismissible={props.dismissible}
          children={props.children}
        />
      </div>
    ),
    {
      id: props.id,
      duration: props.dismissible === false ? Infinity : props.duration ?? DEFAULT_TOAST_DURATION_MS,
    },
  );
}

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { t } = useLingui();
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      containerAriaLabel={t`Notifications`}
      className="toaster group z-[1000]"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:border-0 group-[.toaster]:shadow-md group-[.toaster]:rounded-surface group-[.toaster]:overflow-visible group-[.toaster]:w-[300px]",
          description: "group-[.toast]:text-muted-foreground",
          closeButton: "z-10",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
