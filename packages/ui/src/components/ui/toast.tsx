import { X } from "lucide-react";
import { useTheme } from "next-themes";
import React from "react";
import { toast as sonnerToast, Toaster as Sonner } from "sonner";

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
  const { id, title, content, buttons = [], dismissible, children } = props;

  return (
    <div className="relative flex flex-col gap-2 rounded-lg border-0 bg-background p-4 text-foreground shadow-md">
      {dismissible && (
        <button
          onClick={() => sonnerToast.dismiss(id)}
          className="cursor-pointer absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}

      <div className="text-sm font-medium">{title}</div>

      {content && <div className="text-sm text-muted-foreground">{content}</div>}

      {buttons.length > 0 && (
        <div className="flex gap-2 mt-2">
          {buttons.map((button, index) => (
            <button
              key={index}
              onClick={() => {
                button.onClick();
                sonnerToast.dismiss(id);
              }}
              className={button.primary
                ? "px-3 py-1.5 text-sm bg-foreground/80 text-background rounded-md hover:bg-foreground/60"
                : "px-3 py-1.5 text-sm bg-secondary text-foreground rounded-md hover:bg-surface-400"}
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
      <div className="group w-[300px] overflow-clip rounded-lg">
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
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group z-[1000]"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:border-0 group-[.toaster]:shadow-md group-[.toaster]:rounded-lg group-[.toaster]:overflow-visible group-[.toaster]:w-[300px]",
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
