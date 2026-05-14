import { Trans } from "@lingui/react/macro";
import { memo, useEffect, useState } from "react";

import { useRightPanel } from "@/contexts";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { ShortcutById } from "../../shortcut-by-id";

function ChatPanelButtonBase() {
  const { isViewVisible, togglePanel } = useRightPanel();
  const [isAnimating, setIsAnimating] = useState(false);

  const isActive = isViewVisible("chat");

  useEffect(() => {
    const animationInterval = setInterval(() => {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setIsAnimating(false);
      }, 1625);
      return () => clearTimeout(timeout);
    }, 4625);

    return () => clearInterval(animationInterval);
  }, []);

  const handleClick = () => {
    togglePanel("chat");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className={cn("text-xs size-7 p-0", isActive && "bg-surface-400")}
        >
          <div className="relative w-6 aspect-square flex items-center justify-center">
            <img
              src={isAnimating ? "/assets/dynamic.gif" : "/assets/static.png"}
              alt="Chat Assistant"
              className="w-full h-full"
            />
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          <Trans>Toggle chat panel</Trans> <ShortcutById shortcutId="toggle-assistant" />
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export const ChatPanelButton = memo(ChatPanelButtonBase);
