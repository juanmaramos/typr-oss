import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { DataPathBlock } from "@/components/settings/components/data-path-block";
import { useTypr } from "@/contexts";
import { claudeMcpStatusQueryKey, useClaudeMcpStatus } from "@/hooks/useClaudeMcpStatus";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { toast } from "@typr/ui/components/ui/toast";
import { invoke } from "@tauri-apps/api/core";

export default function IntegrationsComponent() {
  const { t } = useLingui();
  const { userId } = useTypr();

  const queryClient = useQueryClient();
  const claudeStatus = useClaudeMcpStatus();

  // Setup Claude MCP
  const setupClaudeMcp = useMutation({
    mutationFn: async () => {
      return await invoke<string>("setup_claude_mcp");
    },
    onSuccess: () => {
      toast({
        id: "claude-mcp-setup-success",
        title: <Trans>Claude integration enabled</Trans>,
        content: t`Restart Claude Desktop to activate Typr Local.`,
        dismissible: true,
        duration: 4000,
      });
      return queryClient.invalidateQueries({ queryKey: claudeMcpStatusQueryKey });
    },
    onError: (error: unknown) => {
      console.error("Failed to set up Claude MCP:", error);
      toast({
        id: "claude-mcp-setup-failed",
        title: <Trans>Setup failed</Trans>,
        content: error === "CLAUDE_MCP_NAME_CONFLICT"
          ? t`The Typr Local name is already used by another MCP server. Rename that server in Claude Desktop, then try again.`
          : error === "CLAUDE_MCP_SETTINGS_CONFLICT"
          ? t`Your legacy Typr MCP configurations have different settings. Keep one configuration in Claude Desktop, then try again.`
          : t`Failed to set up Claude integration`,
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
    onSuccess: () => {
      toast({
        id: "claude-mcp-remove-success",
        title: <Trans>Claude integration disabled</Trans>,
        content: t`Restart Claude Desktop to finish disconnecting Typr Local.`,
        dismissible: true,
        duration: 4000,
      });
      return queryClient.invalidateQueries({ queryKey: claudeMcpStatusQueryKey });
    },
    onError: (error: unknown) => {
      console.error("Failed to disconnect Claude MCP:", error);
      toast({
        id: "claude-mcp-remove-failed",
        title: <Trans>Disconnect failed</Trans>,
        content: t`Failed to disconnect Claude integration`,
        dismissible: true,
        duration: 5000,
      });
    },
  });

  const isSettingUp = setupClaudeMcp.isPending;
  const isDisconnecting = removeClaudeMcp.isPending;

  const handleSetupClaude = () => {
    analyticsCommands.event({
      event: "claude_integration_setup_clicked",
      distinct_id: userId,
      properties: { source: "integrations_settings" },
    });

    setupClaudeMcp.mutate();
  };

  const handleRemoveClaude = () => {
    analyticsCommands.event({
      event: "claude_integration_disconnect_clicked",
      distinct_id: userId,
      properties: { source: "integrations_settings" },
    });

    removeClaudeMcp.mutate();
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
                  {claudeStatus.isSuccess && claudeStatus.data && (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      <Trans>Configured</Trans>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {claudeStatus.data
                    ? (
                      <Trans>
                        Restart Claude Desktop after changing this integration. Select Typr Local in Claude to access your meeting notes.
                      </Trans>
                    )
                    : (
                      <Trans>
                        Configure the Typr Local connector to access your meeting notes in Claude Desktop.
                      </Trans>
                    )}
                </p>
              </div>
            </div>

            {claudeStatus.data
              ? (
                <Button
                  onClick={handleRemoveClaude}
                  disabled={isDisconnecting || isSettingUp || claudeStatus.isFetching}
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
                  disabled={isSettingUp || isDisconnecting || claudeStatus.isPending || claudeStatus.isFetching}
                  size="sm"
                  className="shrink-0"
                >
                  {isSettingUp ? <Trans>Setting up...</Trans> : <Trans>Connect</Trans>}
                </Button>
              )}
          </div>
          {claudeStatus.isError && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              <Trans>Could not check Claude Desktop configuration.</Trans>
            </p>
          )}
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
