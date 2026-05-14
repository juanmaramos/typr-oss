import { ShortcutById } from "@/components/shortcut-by-id";
import { Icon } from "@/components/ui/icon";
import { useTypr } from "@/contexts";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import { useAppInfo } from "@/hooks/use-app-info";
import { cn } from "@/lib/utils";
import { commands as dbCommands } from "@typr/plugin-db";
import { Avatar, AvatarFallback } from "@typr/ui/components/ui/avatar";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";

import { ThemeToggle } from "@/components/left-sidebar/theme-toggle";
import { useShortcuts } from "@/components/shortcuts-window";

// Importing the custom finder icon
// function CustomFinderIcon({ size = 16 }: { size?: number }) {
//   return (
//     <svg
//       xmlns="http://www.w3.org/2000/svg"
//       viewBox="0 0 24 24"
//       fill="currentColor"
//       width={size}
//       height={size}
//     >
//       <path d="M21.001 3C21.5533 3 22.001 3.44772 22.001 4V20C22.001 20.5523 21.5533 21 21.001 21H3.00098C2.44869 21 2.00098 20.5523 2.00098 20V4C2.00098 3.44772 2.44869 3 3.00098 3H21.001ZM10.4817 4.99884L4.00098 5V19L12.747 18.9997C12.6851 18.6562 12.6308 18.3163 12.5844 17.98C12.2874 17.9933 12.0929 18 12.001 18C9.79308 18 7.60332 17.2701 5.44628 15.8321L6.55568 14.1679C8.39863 15.3966 10.2089 16 12.001 16C12.1337 16 12.2664 15.9967 12.3993 15.9901C12.3747 15.4926 12.3747 14.5797 12.4064 14H9.50098V13C9.50098 9.72527 9.82146 7.06094 10.4817 4.99884ZM12.601 4.99851C11.9358 6.58176 11.5567 9.41121 11.5119 12H14.6338L14.4933 13.124C14.3927 13.9288 14.3567 14.7687 14.3857 15.6439C15.3987 15.3449 16.4174 14.8539 17.4463 14.1679L18.5557 15.8321C17.2358 16.7119 15.9038 17.3267 14.5628 17.6714C14.62 18.1052 14.6937 18.5482 14.7819 18.999L20.001 19V5L12.601 4.99851ZM7.00098 7C7.55326 7 8.00098 7.44772 8.00098 8V9C8.00098 9.55228 7.55326 10 7.00098 10C6.44869 10 6.00098 9.55228 6.00098 9V8C6.00098 7.44772 6.44869 7 7.00098 7ZM17.001 7C17.5533 7 18.001 7.44772 18.001 8V9C18.001 9.55228 17.5533 10 17.001 10C16.4487 10 16.001 9.55228 16.001 9V8C16.001 7.44772 16.4487 7 17.001 7Z">
//       </path>
//     </svg>
//   );
// }

export function NavUser({ variant = "sidebar" }: { variant?: "sidebar" | "rail" }) {
  // const handleClickFinder = () => {
  //   windowsCommands.windowShow({ type: "finder" });
  // };

  const { userId } = useTypr();
  const appInfo = useAppInfo();

  const userProfile = useQuery({
    queryKey: ["config", "profile", userId],
    queryFn: async () => {
      const human = await dbCommands.getHuman(userId);
      return { human };
    },
    enabled: !!userId,
    select: (data) => data.human,
  });

  const getInitials = (name: string | null) => {
    if (!name) {
      return "?";
    }
    const parts = name.trim().split(" ");
    return parts.length === 1
      ? parts[0][0]?.toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const { openDialog } = useSettingsDialog();

  const handleClickSettings = () => {
    openDialog();
  };

  const handleClickFeedback = () => {
    openUrl("https://github.com/juanmaramos/typr-oss/issues");
  };

  const { openShortcuts } = useShortcuts();
  const railTooltipLabel = "Account & settings";
  const avatar = userProfile.data?.full_name
    ? (
      <Avatar className={cn("bg-secondary", variant === "rail" ? "h-9 w-9" : "h-8 w-8")}>
        <AvatarFallback className="bg-muted text-foreground font-medium">
          {getInitials(userProfile.data.full_name)}
        </AvatarFallback>
      </Avatar>
    )
    : (
      <Avatar
        variant="rounded"
        className={cn("bg-secondary", variant === "rail" ? "h-9 w-9" : "h-8 w-8")}
      >
        <AvatarFallback variant="rounded" className="text-sm">
          <Icon name="ri-settings-3-line" className="size-4" />
        </AvatarFallback>
      </Avatar>
    );
  const trigger = variant === "rail"
    ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-muted-foreground"
        aria-label={railTooltipLabel}
      >
        {avatar}
      </Button>
    )
    : (
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-between p-2"
      >
        {avatar}
        <div className="ml-2 min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">
            {userProfile.data?.full_name
              ? userProfile.data.full_name
              : <Trans>Settings</Trans>}
          </p>
          <p className="text-xs text-muted-foreground">
            <Trans>Settings</Trans>
          </p>
        </div>
      </Button>
    );

  return (
    <div
      className={cn(
        "mt-auto",
        variant === "rail" ? "flex justify-center px-3 pb-3 pt-2" : "flex items-center gap-1 px-4 py-2",
      )}
    >
      <DropdownMenu>
        {variant === "rail"
          ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    {trigger}
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {railTooltipLabel}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
          : (
            <DropdownMenuTrigger asChild>
              {trigger}
            </DropdownMenuTrigger>
          )}
        <DropdownMenuContent
          className="z-[120] w-56 border-border/50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/75"
          side="top"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>
              <Trans>Options</Trans>
            </span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              <Trans>OSS</Trans>
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {/* Temporarily hidden - keeping for future use */}
            {
              /* <DropdownMenuItem onClick={handleClickFinder}>
              <CustomFinderIcon size={16} />
              <span><Trans>Open finder view</Trans></span>
            </DropdownMenuItem> */
            }
            <DropdownMenuItem onClick={handleClickFeedback}>
              <Icon name="ri-feedback-line" className="text-base" />
              <span>
                <Trans>Feedback</Trans>
              </span>
              <Icon name="ri-external-link-line" className="ml-auto text-xs" />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openShortcuts}>
              <Icon name="ri-keyboard-line" className="text-base" />
              <span>
                <Trans>Shortcuts</Trans>
              </span>
              <ShortcutById shortcutId="show-shortcuts" />
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClickSettings}>
              <Icon name="ri-settings-3-line" className="text-base" />
              <span>
                <Trans>Settings</Trans>
              </span>
              <ShortcutById shortcutId="open-settings" />
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>{appInfo.data ? `${appInfo.data.name} ${appInfo.data.version}` : "Typr"}</span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {variant !== "rail" && <ThemeToggle />}
    </div>
  );
}
