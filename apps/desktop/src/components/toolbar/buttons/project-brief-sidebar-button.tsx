import { Icon } from "@/components/ui/icon";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useRightPanel } from "@/contexts";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";

export function ProjectBriefSidebarButton() {
  const { hidePanel, isViewVisible, showSidebar } = useRightPanel();
  const isActive = isViewVisible("project-brief");

  const handleClick = () => {
    if (isActive) {
      debugLogFor("DEBUG_PROJECT_BRIEF", "ProjectBriefDebug", "topbar:close");
      hidePanel();
      return;
    }

    debugLogFor("DEBUG_PROJECT_BRIEF", "ProjectBriefDebug", "topbar:open");
    showSidebar("project-brief");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn(
            "size-8 rounded-md text-muted-foreground hover:bg-surface-400 hover:text-foreground",
            isActive && "bg-surface-400 text-foreground",
          )}
        >
          <Icon name={isActive ? "ri-layout-right-2-line" : "ri-layout-right-line"} className="h-[18px] w-[18px]" />
          <span className="sr-only">{isActive ? "Close project brief" : "Open project brief"}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{isActive ? "Close project brief" : "Open project brief"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
