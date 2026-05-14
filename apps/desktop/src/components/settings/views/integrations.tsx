import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";

import { DataPathBlock } from "@/components/settings/components/data-path-block";
import { useTypr } from "@/contexts";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { toast } from "@typr/ui/components/ui/toast";
import { invoke } from "@tauri-apps/api/core";

export default function IntegrationsComponent() {
  const { t } = useLingui();
  const { userId } = useTypr();

  // Check Claude MCP status
  const claudeStatus = useQuery({
    queryKey: ["claude-mcp-status"],
    queryFn: async () => {
      try {
        return await invoke<boolean>("check_claude_mcp_status");
      } catch (error) {
        console.error("Failed to check Claude MCP status:", error);
        return false;
      }
    },
  });

  // Setup Claude MCP
  const setupClaudeMcp = useMutation({
    mutationFn: async () => {
      return await invoke<string>("setup_claude_mcp");
    },
    onSuccess: (message) => {
      toast({
        id: "claude-mcp-setup-success",
        title: <Trans>Claude integration enabled</Trans>,
        content: message,
        dismissible: true,
        duration: 4000,
      });
      claudeStatus.refetch();
    },
    onError: (error: any) => {
      toast({
        id: "claude-mcp-setup-failed",
        title: <Trans>Setup failed</Trans>,
        content: error?.toString() || t`Failed to set up Claude integration`,
        dismissible: true,
        duration: 5000,
      });
    },
  });

  // Remove Claude MCP
  const removeClaudeMcp = useMutation({
    mutationFn: async () => {
      return await invoke<string>("remove_claude_mcp");
    },
    onSuccess: (message) => {
      toast({
        id: "claude-mcp-remove-success",
        title: <Trans>Claude integration disabled</Trans>,
        content: message,
        dismissible: true,
        duration: 4000,
      });
      claudeStatus.refetch();
    },
    onError: (error: any) => {
      toast({
        id: "claude-mcp-remove-failed",
        title: <Trans>Disconnect failed</Trans>,
        content: error?.toString() || t`Failed to disconnect Claude integration`,
        dismissible: true,
        duration: 5000,
      });
    },
  });

  const isSettingUp = setupClaudeMcp.isPending;
  const isDisconnecting = removeClaudeMcp.isPending;

  const handleSetupClaude = async () => {
    analyticsCommands.event({
      event: "claude_integration_setup_clicked",
      distinct_id: userId,
      properties: { source: "integrations_settings" },
    });

    await setupClaudeMcp.mutateAsync();
  };

  const handleRemoveClaude = async () => {
    analyticsCommands.event({
      event: "claude_integration_disconnect_clicked",
      distinct_id: userId,
      properties: { source: "integrations_settings" },
    });

    await removeClaudeMcp.mutateAsync();
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">
          <Trans>Integrations</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>Connect Typr with AI assistants to access your meeting notes.</Trans>
        </p>
      </div>

      <div className="space-y-3">
        {/* Claude Desktop Integration */}
        <div className="rounded-xl border bg-card/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DE7356]">
                <i className="ri-claude-fill text-[20px] text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    <Trans>Claude Desktop</Trans>
                  </h4>
                  {claudeStatus.data && (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      <Trans>Connected</Trans>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {claudeStatus.data
                    ? (
                      <Trans>
                        Typr appears in your Claude connectors. Ask things like{" "}
                        <em className="not-italic text-muted-foreground/80">
                          "Do I have any meeting notes about project updates?"
                        </em>
                      </Trans>
                    )
                    : (
                      <Trans>
                        Search and query your meeting notes from Claude Desktop.
                      </Trans>
                    )}
                </p>
              </div>
            </div>

            {claudeStatus.data
              ? (
                <Button
                  onClick={handleRemoveClaude}
                  disabled={isDisconnecting || isSettingUp}
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {isDisconnecting ? <Trans>Disconnecting...</Trans> : <Trans>Disconnect</Trans>}
                </Button>
              )
              : (
                <Button
                  onClick={handleSetupClaude}
                  disabled={isSettingUp || isDisconnecting}
                  size="sm"
                  className="shrink-0"
                >
                  {isSettingUp ? <Trans>Setting up...</Trans> : <Trans>Connect</Trans>}
                </Button>
              )}
          </div>
        </div>

        {/* ChatGPT Integration - Coming Soon */}
        <div className="rounded-xl border bg-card/40 p-4 opacity-60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
                <i className="ri-openai-fill text-[20px]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    <Trans>ChatGPT</Trans>
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    <Trans>Coming Soon</Trans>
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Trans>Access your meeting notes directly from ChatGPT.</Trans>
                </p>
              </div>
            </div>

            <Button disabled size="sm" className="shrink-0">
              <Trans>Connect</Trans>
            </Button>
          </div>
        </div>
      </div>

      {/* Direct Access */}
      <div className="mt-8">
        <h3 className="text-sm font-medium mb-1">
          <Trans>Direct access</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Use this path with apps like Claude, Cursor, VS Code, or Codex to read your notes directly.
          </Trans>
        </p>
        <DataPathBlock />
      </div>
    </div>
  );
}
