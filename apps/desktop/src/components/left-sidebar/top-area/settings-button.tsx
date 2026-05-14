import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getName, getVersion } from "@tauri-apps/api/app";
import { CodeIcon, CogIcon } from "lucide-react";
import { useState } from "react";

import { ShortcutById } from "@/components/shortcut-by-id";
import { useTypr } from "@/contexts";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import { openURL } from "@/utils/shell";
import { commands as windowsCommands } from "@typr/plugin-windows";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { cn } from "@typr/ui/lib/utils";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const { userId } = useTypr();
  const { openDialog } = useSettingsDialog();

  const versionQuery = useQuery({
    queryKey: ["appVersion"],
    queryFn: async () => {
      const [version, name] = await Promise.all([getVersion(), getName()]);
      return `${name} ${version}`;
    },
  });

  const handleClickSettings = () => {
    setOpen(false);
    openDialog();
  };

  const handleClickProfile = () => {
    setOpen(false);
    windowsCommands.windowShow({ type: "human", value: userId });
  };

  const handleClickPlans = () => {
    setOpen(false);
    openDialog("ai", null, "chat");
  };

  const handleClickChangelog = async () => {
    setOpen(false);
    try {
      await openURL("https://github.com/juanmaramos/typr-oss/releases");
    } catch (error) {
      console.error("Failed to open changelog:", error);
    }
  };

  const handleClickIssues = async () => {
    setOpen(false);
    try {
      await openURL("https://github.com/juanmaramos/typr-oss/issues");
    } catch (error) {
      console.error("Failed to open issues:", error);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <CogIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52 p-0">
        <DropdownHeader handleClick={handleClickPlans} />

        <div className="p-1">
          <DropdownMenuItem
            onClick={handleClickSettings}
            className="cursor-pointer"
          >
            <Trans>Settings</Trans>
            <ShortcutById shortcutId="open-settings" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleClickProfile}
            className="cursor-pointer"
          >
            <Trans>My Profile</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleClickIssues}
            className="cursor-pointer"
          >
            <Trans>Report an issue</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleClickChangelog}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            <span>{versionQuery.data ?? "..."}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DropdownHeader({
  handleClick,
}: {
  handleClick: () => void;
}) {
  return (
    <div
      onClick={handleClick}
      className={cn([
        "px-3 py-2 bg-gradient-to-r rounded-t-md relative overflow-hidden cursor-pointer",
        "from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70",
      ])}
    >
      <div className="absolute inset-0 opacity-70">
      </div>
      <div className="flex items-center gap-3 text-background relative z-10">
        <CodeIcon className="size-8" />
        <div>
          <div className="font-medium">
            OSS Edition
          </div>
          <div className="text-xs text-background/80 mt-0.5">
            Local and BYOK
          </div>
        </div>
      </div>
    </div>
  );
}
