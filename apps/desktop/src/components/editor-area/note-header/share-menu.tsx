import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { message } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import { useClaudeMcpStatus } from "@/hooks/useClaudeMcpStatus";
import { type Session } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { exportToPDF } from "../../toolbar/utils/pdf-export";
import { buildEmailShareUrl, copyAiSummaryToClipboard } from "../../toolbar/utils/share-session";

interface ShareMenuProps {
  session: Session;
}

type ShareAction = "copy" | "pdf" | "email" | "claude" | null;

export function ShareMenu({ session }: ShareMenuProps) {
  const { t } = useLingui();
  const { openDialog } = useSettingsDialog();
  const [menuOpen, setMenuOpen] = useState(false);
  const claudeStatus = useClaudeMcpStatus(menuOpen);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const shareMutation = useMutation({
    mutationFn: async (action: Exclude<ShareAction, null>) => {
      if (action === "claude") {
        const sessionId = session.id;
        const prompt =
          t`Use only the Claude Desktop MCP connector named exactly "Typr Local". Read this meeting with get_session using id "${sessionId}". Use get_transcript from the same connector with the same id if needed. If the session is unavailable, stop and ask me to reconnect Typr Local in Integrations. Help me explore the meeting notes.`;
        await openUrl(`claude://claude.ai/new?q=${encodeURIComponent(prompt)}`);
        return { action };
      }

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
    onError: (error, action) => {
      console.error(error);
      if (action === "claude") {
        toast({
          id: "claude-share-failed",
          title: t`Could not open Claude Desktop`,
          content: t`Make sure Claude Desktop is installed, then try again.`,
          dismissible: true,
        });
        return;
      }
      message(JSON.stringify(error), { title: t`Error`, kind: "error" });
    },
  });

  const pendingAction = shareMutation.variables ?? null;
  const claudeConfigured = claudeStatus.isSuccess && claudeStatus.data;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 rounded-full px-3 text-ui shadow-none">
          <Icon name="ri-share-forward-line" className="h-4 w-4 text-muted-foreground" />
          <Trans>Share</Trans>
          <Icon name="ri-arrow-down-s-line" className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <div role="group" aria-label={t`Claude Desktop`} className="flex items-center">
          <DropdownMenuItem
            onSelect={() => shareMutation.mutate("claude")}
            disabled={!claudeConfigured || claudeStatus.isFetching || shareMutation.isPending}
            title={t`Opens a new chat in Claude Desktop to read this note using the Typr Local MCP connector.`}
            className="min-w-0 flex-1 cursor-pointer"
          >
            <Icon name="ri-claude-fill" className="h-4 w-4 text-muted-foreground" />
            <Trans>Ask Claude Desktop</Trans>
          </DropdownMenuItem>
          {!claudeConfigured && (
            <DropdownMenuItem
              onSelect={() => openDialog("integrations")}
              aria-label={t`Configure Claude Desktop integration`}
              title={t`Configure Claude Desktop integration`}
              className="shrink-0 cursor-pointer"
            >
              <Icon name="ri-settings-3-line" className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuItem>
          )}
        </div>

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
