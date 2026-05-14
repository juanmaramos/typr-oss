import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { message } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { type Session } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { cn } from "@typr/ui/lib/utils";
import { exportToPDF } from "../../toolbar/utils/pdf-export";
import { buildEmailShareUrl, copyAiSummaryToClipboard } from "../../toolbar/utils/share-session";

interface ShareMenuProps {
  session: Session;
}

type ShareAction = "copy" | "pdf" | "email" | null;

export function ShareMenu({ session }: ShareMenuProps) {
  const { t } = useLingui();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const shareMutation = useMutation({
    mutationFn: async (action: Exclude<ShareAction, null>) => {
      if (action === "copy") {
        await copyAiSummaryToClipboard(session);
        return { action };
      }

      if (action === "pdf") {
        const path = await exportToPDF(session);
        return { action, path };
      }

      const url = await buildEmailShareUrl(session);
      return { action, url };
    },
    onSuccess: (result) => {
      if (result.action === "copy") {
        setCopyStatus("copied");
        window.setTimeout(() => setCopyStatus("idle"), 2000);
        return;
      }

      if (result.action === "pdf" && result.path) {
        openPath(result.path);
        return;
      }

      if (result.action === "email" && result.url) {
        openUrl(result.url);
      }
    },
    onError: (error) => {
      console.error(error);
      message(JSON.stringify(error), { title: t`Error`, kind: "error" });
    },
  });

  const pendingAction = shareMutation.variables ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 rounded-full px-3 text-[13px] shadow-none">
          <Icon name="ri-share-forward-line" className="h-4 w-4 text-muted-foreground" />
          <Trans>Share</Trans>
          <Icon name="ri-arrow-down-s-line" className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => shareMutation.mutate("copy")}
          disabled={shareMutation.isPending}
          className="cursor-pointer"
        >
          <Icon name="ri-file-copy-line" className="h-4 w-4 text-muted-foreground" />
          <span className={cn(copyStatus === "copied" && "text-primary")}>
            {copyStatus === "copied"
              ? t`Copied`
              : pendingAction === "copy" && shareMutation.isPending
              ? t`Copying...`
              : t`Copy AI notes`}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => shareMutation.mutate("pdf")}
          disabled={shareMutation.isPending}
          className="cursor-pointer"
        >
          <Icon name="ri-file-pdf-2-line" className="h-4 w-4 text-muted-foreground" />
          <span>
            {pendingAction === "pdf" && shareMutation.isPending ? t`Exporting...` : t`Export as PDF`}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => shareMutation.mutate("email")}
          disabled={shareMutation.isPending}
          className="cursor-pointer"
        >
          <Icon name="ri-mail-line" className="h-4 w-4 text-muted-foreground" />
          <span>
            {pendingAction === "email" && shareMutation.isPending ? t`Preparing...` : t`Send by email`}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
