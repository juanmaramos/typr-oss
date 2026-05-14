import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ScrollButtonProps = {
  className?: string;
  containerRef: React.RefObject<HTMLElement | null>;
  scrollRef?: React.RefObject<HTMLElement | null>;
  threshold?: number;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

function isNearBottom(element: HTMLElement, threshold: number) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

function ScrollButton({
  className,
  containerRef,
  scrollRef,
  threshold = 50,
  variant = "outline",
  size = "sm",
  onClick,
  ...props
}: ScrollButtonProps) {
  const [visible, setVisible] = useState(false);

  const updateVisible = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setVisible(!isNearBottom(container, threshold));
  }, [containerRef, threshold]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    updateVisible();
    container.addEventListener("scroll", updateVisible, { passive: true });
    return () => container.removeEventListener("scroll", updateVisible);
  }, [containerRef, updateVisible]);

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "h-10 w-10 rounded-full transition-all duration-150 ease-out",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (scrollRef?.current) {
          scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
          return;
        }

        const container = containerRef.current;
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }}
      {...props}
    >
      <ChevronDown className="h-5 w-5" />
    </Button>
  );
}

export { ScrollButton };
