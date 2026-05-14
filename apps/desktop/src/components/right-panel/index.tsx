import { RESIZABLE_PANEL_TRANSITION } from "@/components/app-shell/transitions";
import { ProjectBriefSidebarView } from "@/components/projects/project-brief-sidebar-view";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useRightPanel } from "@/contexts";
import { cn } from "@/lib/utils";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { type ImperativePanelHandle, ResizablePanel } from "@typr/ui/components/ui/resizable";
import { Tabs } from "@typr/ui/components/ui/tabs";
import { Trans } from "@lingui/react/macro";
import { useMatch } from "@tanstack/react-router";
import { Component, ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { captureTelemetryException } from "@/utils/telemetry";
import { useShowRightSidebar } from "./hooks/useShowRightSidebar";
import { ChatView, TranscriptView } from "./views";

const RIGHT_PANEL_MIN_WIDTH_PX = 335;
const RIGHT_PANEL_DEFAULT_SIZE_PERCENT = 25;
const RIGHT_PANEL_MAX_SIZE_PERCENT = 50;

function TranscriptErrorFallback() {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <div className="text-center">
        <p className="text-muted-foreground mb-2">
          <Trans>Failed to load transcription</Trans>
        </p>
        <p className="text-xs text-muted-foreground">
          <Trans>Please try opening a note first or refresh the app</Trans>
        </p>
      </div>
    </div>
  );
}

class TranscriptErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Transcript view error:", error, errorInfo);

    captureTelemetryException(error, {
      tags: {
        component: "TranscriptView",
        location: "right-panel",
      },
      contexts: {
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
        page: {
          url: window.location.href,
        },
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return <TranscriptErrorFallback />;
    }
    return this.props.children;
  }
}

interface RightPanelProps {
  panelGroupWidth: number | null;
}

export default function RightPanel({ panelGroupWidth }: RightPanelProps) {
  const { currentView, switchView } = useRightPanel();
  const show = useShowRightSidebar();
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const projectMatch = useMatch({ from: "/app/projects/$projectId", shouldThrow: false });
  const panelRef = useRef<ImperativePanelHandle | null>(null);
  const lastOpenSizeRef = useRef(RIGHT_PANEL_DEFAULT_SIZE_PERCENT);

  const isMainWindow = getCurrentWebviewWindowLabel() === "main";
  const hasNoteRoute = Boolean(noteMatch?.params.id);
  const hasProjectRoute = Boolean(projectMatch?.params.projectId);
  const shouldRenderNoteContent = isMainWindow && hasNoteRoute && currentView !== "project-brief";
  const shouldRenderProjectBrief = isMainWindow && hasProjectRoute && currentView === "project-brief";
  const shouldRenderContent = shouldRenderNoteContent || shouldRenderProjectBrief;

  const openMinSize = useMemo(() => {
    if (!panelGroupWidth) {
      return RIGHT_PANEL_DEFAULT_SIZE_PERCENT;
    }
    return Math.min(
      RIGHT_PANEL_MAX_SIZE_PERCENT,
      Math.max(
        RIGHT_PANEL_DEFAULT_SIZE_PERCENT,
        (RIGHT_PANEL_MIN_WIDTH_PX / panelGroupWidth) * 100,
      ),
    );
  }, [panelGroupWidth]);

  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResize = useCallback((sizePercent: number) => {
    if (!show) {
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (sizePercent > 0) {
        panelRef.current?.resize(0);
      }
      return;
    }

    if (show && sizePercent >= openMinSize) {
      lastOpenSizeRef.current = Math.min(sizePercent, RIGHT_PANEL_MAX_SIZE_PERCENT);
    }

    if (resizeTimerRef.current !== null) {
      clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = null;
      const actualPx = panelGroupWidth ? Math.round((sizePercent / 100) * panelGroupWidth) : null;
      debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "right panel size settled", {
        sizePercent: Math.round(sizePercent * 10) / 10,
        actualPx,
        minSizePercent: Math.round(openMinSize * 10) / 10,
      });
    }, 200);
  }, [panelGroupWidth, openMinSize, show]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    if (show) {
      panel.resize(Math.max(openMinSize, lastOpenSizeRef.current));
    } else {
      panel.resize(0);
    }
  }, [show, openMinSize]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="right-panel"
      order={2}
      defaultSize={show ? openMinSize : 0}
      minSize={show ? openMinSize : 0}
      maxSize={show ? RIGHT_PANEL_MAX_SIZE_PERCENT : 0}
      onResize={onResize}
      className={cn(
        "flex h-full flex-col overflow-hidden bg-sidebar border-l not-draggable",
        RESIZABLE_PANEL_TRANSITION,
        show && shouldRenderContent
          ? "opacity-100 border-border"
          : "pointer-events-none opacity-0 border-l-transparent",
      )}
    >
      {shouldRenderNoteContent && (
        <>
          <div className="h-11 shrink-0 bg-background" />
          <Tabs
            value={currentView}
            onValueChange={(value) => switchView(value as "chat" | "transcript")}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className={cn("flex-1 overflow-hidden", currentView !== "chat" && "hidden")}>
              <ChatView />
            </div>

            <div className={cn("flex-1 overflow-hidden", currentView !== "transcript" && "hidden")}>
              <TranscriptErrorBoundary>
                <TranscriptView />
              </TranscriptErrorBoundary>
            </div>
          </Tabs>
        </>
      )}

      {shouldRenderProjectBrief && <ProjectBriefSidebarView />}
    </ResizablePanel>
  );
}
