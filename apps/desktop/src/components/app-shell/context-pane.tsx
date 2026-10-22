import LeftSidebar from "@/components/left-sidebar";
import { NavUser } from "@/components/left-sidebar/nav-user";
import { useLeftSidebar } from "@/contexts";
import { FEATURES } from "@/lib/features";
import { cn } from "@typr/ui/lib/utils";
import { CONTEXT_PANE_TRANSITION } from "./transitions";
import { useShellMode } from "./use-shell-mode";

const CONTEXT_PANE_WIDTH_PX = 264;
const CONTEXT_PANE_OPEN_WIDTH_CLASS = "w-[264px]";

export function ContextPane() {
  const shellMode = useShellMode();
  const { isExpanded } = useLeftSidebar();

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
          <LeftSidebar />

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
