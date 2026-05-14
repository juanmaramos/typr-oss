import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { useTheme } from "@typr/ui/contexts/theme";
import { Trans } from "@lingui/react/macro";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isDark = theme === "dark";

  const toggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const icon = isDark ? <Moon className="size-4" /> : <Sun className="size-4" />;
  const label = isDark ? <Trans>Dark</Trans> : <Trans>Light</Trans>;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={toggle}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
