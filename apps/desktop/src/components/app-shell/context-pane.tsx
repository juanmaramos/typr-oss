import LeftSidebar from "@/components/left-sidebar";
import { NavUser } from "@/components/left-sidebar/nav-user";
import { useLeftSidebar } from "@/contexts";
import { FEATURES } from "@/lib/features";
import { Card, CardDescription, CardHeader, CardTitle } from "@typr/ui/components/ui/card";
import { cn } from "@typr/ui/lib/utils";
import { Trans } from "@lingui/react/macro";
import { useLocation } from "@tanstack/react-router";
import { CONTEXT_PANE_TRANSITION } from "./transitions";
import { useShellMode } from "./use-shell-mode";

const CONTEXT_PANE_WIDTH_PX = 264;
const CONTEXT_PANE_OPEN_WIDTH_CLASS = "w-[264px]";

function AskTyprPane({ variant = "global" }: { variant?: "global" | "meeting" }) {
  const isMeetingVariant = variant === "meeting";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-sidebar">
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          {isMeetingVariant ? <Trans>Conversations</Trans> : <Trans>Ask Typr</Trans>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isMeetingVariant
            ? <Trans>Meeting chat threads will live here while the note stays visible in the main canvas.</Trans>
            : <Trans>Cross-meeting conversations will live here. The main canvas shows the active thread.</Trans>}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Card
          variant="outline"
          className="rounded-2xl border-dashed border-sidebar-border bg-background/60 shadow-none"
        >
          <CardHeader spacing="compact" className="p-4">
            <CardTitle className="text-sm font-medium text-foreground">
              {isMeetingVariant ? <Trans>No meeting chats yet</Trans> : <Trans>No conversations yet</Trans>}
            </CardTitle>
            <CardDescription className="text-xs leading-5 text-muted-foreground">
              {isMeetingVariant
                ? (
                  <Trans>
                    Start a chat from the sidebar assistant and your note-specific threads will appear in this list.
                  </Trans>
                )
                : (
                  <Trans>
                    Start a cross-meeting query from the main canvas and your threads will appear in this list.
                  </Trans>
                )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

export function ContextPane() {
  const location = useLocation();
  const shellMode = useShellMode();
  const { isExpanded } = useLeftSidebar();
  const pathname = location.pathname;

  const usesModePane = FEATURES.SHOW_PRIMARY_RAIL && shellMode !== "notes";
  const isOpen = usesModePane ? true : isExpanded;
  const widthClass = isOpen ? CONTEXT_PANE_OPEN_WIDTH_CLASS : "w-0";

  return (
    <div
      className={cn(
        "h-full shrink-0 overflow-hidden bg-sidebar",
        CONTEXT_PANE_TRANSITION,
        widthClass,
        isOpen ? "opacity-100" : "opacity-0",
        !FEATURES.SHOW_PRIMARY_RAIL && "rounded-l-xl",
      )}
      style={isOpen ? { width: `${CONTEXT_PANE_WIDTH_PX}px` } : undefined}
    >
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {FEATURES.SHOW_PRIMARY_RAIL && shellMode === "ask" && (
            <AskTyprPane variant={pathname.startsWith("/app/ask") ? "global" : "meeting"} />
          )}

          {(!FEATURES.SHOW_PRIMARY_RAIL || shellMode === "notes" || shellMode === "projects") && <LeftSidebar />}

          {!FEATURES.SHOW_PRIMARY_RAIL && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sidebar to-transparent" />
          )}
        </div>
        {!FEATURES.SHOW_PRIMARY_RAIL && (
          <div className="shrink-0 border-t border-sidebar-border">
            <NavUser variant="sidebar" />
          </div>
        )}
      </div>
    </div>
  );
}
