import { Trans, useLingui } from "@lingui/react/macro";
import { useMatch } from "@tanstack/react-router";
import { SquareArrowOutUpRightIcon } from "lucide-react";

import { commands as windowsCommands } from "@typr/plugin-windows";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";

export function NewWindowButton() {
  const { t } = useLingui();
  const organizationMatch = useMatch({ from: "/app/organization/$id", shouldThrow: false });
  const humanMatch = useMatch({ from: "/app/human/$id", shouldThrow: false });

  const handleClick = () => {
    if (organizationMatch?.params.id) {
      windowsCommands.windowShow({ type: "organization", value: organizationMatch.params.id });
    } else if (humanMatch?.params.id) {
      windowsCommands.windowShow({ type: "human", value: humanMatch.params.id });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          aria-label={t`Open in new window`}
        >
          <SquareArrowOutUpRightIcon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <Trans>Open in new window</Trans>
      </TooltipContent>
    </Tooltip>
  );
}
