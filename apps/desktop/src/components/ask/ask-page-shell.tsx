import { getWorkspaceColumnStyle } from "@/components/layout/workspace-width";
import { logAskLayoutDebug } from "@/utils/ask-layout-debug";
import { cn } from "@typr/ui/lib/utils";
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from "react";

const ASK_WORKSPACE_COLUMN_STYLE = getWorkspaceColumnStyle("project");
const ASK_FOOTER_GAP_PX = 16;

interface AskPageShellProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  footerClassName?: string;
  floatingControl?: ReactNode;
  scrollContainerRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
}

export function AskPageShell({
  children,
  className,
  floatingControl,
  footer,
  footerClassName,
  onScroll,
  scrollContainerRef,
}: AskPageShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const lastLayoutDebugRef = useRef<string | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  useLayoutEffect(() => {
    const footerElement = footerRef.current;
    if (!footerElement) {
      setFooterHeight(0);
      return;
    }

    const updateFooterHeight = () => {
      setFooterHeight(Math.ceil(footerElement.getBoundingClientRect().height));
    };

    updateFooterHeight();
    const resizeObserver = new ResizeObserver(updateFooterHeight);
    resizeObserver.observe(footerElement);

    return () => resizeObserver.disconnect();
  }, [footer]);

  useLayoutEffect(() => {
    const contentElement = contentRef.current;
    const footerElement = footerRef.current;
    if (!contentElement) {
      return;
    }

    const contentStyle = window.getComputedStyle(contentElement);
    const footerHeight = footerElement ? Math.round(footerElement.getBoundingClientRect().height) : 0;
    const debugKey = [
      Math.round(contentElement.getBoundingClientRect().height),
      contentStyle.paddingBottom,
      footerHeight,
    ].join(":");
    if (lastLayoutDebugRef.current === debugKey) {
      return;
    }

    lastLayoutDebugRef.current = debugKey;
    logAskLayoutDebug("shell", {
      contentHeight: Math.round(contentElement.getBoundingClientRect().height),
      contentPaddingBottom: contentStyle.paddingBottom,
      footerHeight,
    });
  }, [footerHeight]);

  return (
    <main className="relative h-full w-full min-w-0 overflow-hidden">
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="scrollbar-native h-full w-full min-w-0 overflow-x-hidden overflow-y-auto"
      >
        <div
          ref={contentRef}
          className={cn(
            "mx-auto flex min-h-full w-full min-w-0 flex-col px-8 pt-6",
            !footer && "pb-6",
            className,
          )}
          style={{
            ...ASK_WORKSPACE_COLUMN_STYLE,
            ...(footer ? { paddingBottom: footerHeight + ASK_FOOTER_GAP_PX } : null),
          }}
        >
          {children}
        </div>
      </div>

      {floatingControl && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30"
          style={{ bottom: footer ? footerHeight + 8 : 24 }}
        >
          <div
            className="mx-auto flex w-full min-w-0 justify-center px-8"
            style={ASK_WORKSPACE_COLUMN_STYLE}
          >
            <div className="pointer-events-auto">{floatingControl}</div>
          </div>
        </div>
      )}

      {footer && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <div
            ref={footerRef}
            className={cn(
              "mx-auto w-full min-w-0 px-8 pb-7",
              footerClassName,
            )}
            style={ASK_WORKSPACE_COLUMN_STYLE}
          >
            <div className="pointer-events-none h-10 bg-gradient-to-b from-transparent to-background/80" />
            <div className="pointer-events-auto">{footer}</div>
          </div>
        </div>
      )}
    </main>
  );
}
