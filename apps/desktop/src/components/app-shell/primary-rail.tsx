import { Icon } from "@/components/ui/icon";
import { useCommandPalette } from "@/contexts/search";
import { cn } from "@/lib/utils";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NavUser } from "../left-sidebar/nav-user";
import { ShortcutById } from "../shortcut-by-id";
import { useShellMode } from "./use-shell-mode";

type NavItem = {
  id: "notes" | "ask" | "projects";
  label: string;
  to: "/app" | "/app/ask" | "/app/projects";
  iconName: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    id: "notes",
    label: "Notes",
    to: "/app",
    iconName: "ri-sticky-note-line",
  },
  {
    id: "ask",
    label: "Ask",
    to: "/app/ask",
    iconName: "ri-chat-3-line",
  },
  {
    id: "projects",
    label: "Projects",
    to: "/app/projects",
    iconName: "ri-folder-3-line",
  },
];

function RailButton({
  active = false,
  label,
  onClick,
  showSearchShortcut = false,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  showSearchShortcut?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={cn(
            "h-10 w-10 rounded-xl transition-colors",
            active
              ? "bg-accent text-accent-foreground shadow-sm hover:bg-surface-400 hover:text-foreground"
              : "text-muted-foreground hover:bg-surface-400/70 hover:text-foreground",
          )}
          aria-label={label}
          aria-current={active ? "page" : undefined}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {showSearchShortcut && <ShortcutById shortcutId="open-search" variant="ghost" className="text-[10px]" />}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function PrimaryRail() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const activeId = useShellMode();
  const openCommandPalette = useCommandPalette();

  return (
    <aside className="flex h-full w-[64px] flex-col items-center rounded-l-xl bg-sidebar pb-3 pt-[58px]">
      <div className="flex flex-col items-center gap-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeId;

          return (
            <RailButton
              key={item.id}
              label={getNavItemLabel(item.id, t)}
              active={isActive}
              onClick={() => navigate({ to: item.to })}
            >
              <Icon name={item.iconName} className="h-[18px] w-[18px]" />
            </RailButton>
          );
        })}
      </div>

      <div className="my-3 h-px w-7 bg-border/80" />

      <div className="flex flex-col items-center gap-1.5">
        <RailButton label={t`Search`} onClick={openCommandPalette} showSearchShortcut>
          <Icon name="ri-search-line" className="h-[18px] w-[18px]" />
        </RailButton>
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5 pb-3 opacity-90">
        <NavUser variant="rail" />
      </div>
    </aside>
  );
}

function getNavItemLabel(id: NavItem["id"], t: ReturnType<typeof useLingui>["t"]) {
  switch (id) {
    case "ask":
      return t`Ask`;
    case "projects":
      return t`Projects`;
    case "notes":
    default:
      return t`Notes`;
  }
}
