import { Icon } from "@/components/ui/icon";
import { useLeftSidebar } from "@/contexts";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";
import { ShortcutById } from "../../shortcut-by-id";

export function LeftSidebarButton() {
  const { isExpanded, togglePanel } = useLeftSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="h-8 w-8 flex-shrink-0 text-muted-foreground"
        >
          <Icon
            name={isExpanded ? "ri-layout-left-2-line" : "ri-layout-left-line"}
            className="h-[18px] w-[18px] text-muted-foreground"
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          <Trans>Toggle left sidebar</Trans> <ShortcutById shortcutId="toggle-left-sidebar" />
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
