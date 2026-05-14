import { Trans } from "@lingui/react/macro";

import { ShortcutById } from "@/components/shortcut-by-id";
import { RecordingIndicator } from "@/components/transcript/components/RecordingIndicator";
import { Icon } from "@/components/ui/icon";
import { useRightPanel } from "@/contexts";
import { useTranscriptionActive } from "@/hooks/useTranscriptionActive";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";

export function RightSidebarButton() {
  const { currentView, surface, showSidebar, showFloatingDock, hidePanel } = useRightPanel();
  const { isRecordingActive } = useTranscriptionActive();

  const isSidebarActive = surface === "sidebar";
  const isFloatingActive = surface === "floating";

  const shouldShowIndicator = isRecordingActive && !isSidebarActive && !isFloatingActive;
  const noteView = currentView === "project-brief" ? "chat" : currentView;

  const handleSidebar = () => {
    if (isSidebarActive) {
      hidePanel();
    } else {
      showSidebar(noteView);
    }
  };

  const handleFloating = () => {
    if (isFloatingActive) {
      hidePanel();
    } else {
      showFloatingDock(noteView);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 flex-shrink-0 rounded-md text-muted-foreground hover:bg-surface-400 hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:shadow-none"
        >
          {isSidebarActive
            ? <Icon name="ri-layout-right-2-line" className="h-[18px] w-[18px] text-muted-foreground" />
            : <Icon name="ri-layout-right-line" className="h-[18px] w-[18px] text-muted-foreground" />}
          {shouldShowIndicator && (
            <div className="absolute top-2 right-2">
              <RecordingIndicator size="sm" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuCheckboxItem
          checked={isSidebarActive}
          onCheckedChange={() => handleSidebar()}
          className="data-[state=checked]:bg-accent"
        >
          <Trans>Sidebar</Trans>
          <span className="ml-auto pl-4">
            <ShortcutById shortcutId="toggle-assistant" />
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={isFloatingActive}
          onCheckedChange={() => handleFloating()}
          className="data-[state=checked]:bg-accent"
        >
          <Trans>Floating</Trans>
          <span className="ml-auto pl-4">
            <ShortcutById shortcutId="toggle-assistant" />
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
