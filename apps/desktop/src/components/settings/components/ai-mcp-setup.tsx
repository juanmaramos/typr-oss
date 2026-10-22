import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { Button } from "@typr/ui/components/ui/button";

interface McpSetup {
  claude_json: string;
  codex_toml: string;
}

export function AiMcpSetup() {
  const { t } = useLingui();
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const setup = useQuery({
    queryKey: ["ai-mcp-setup"],
    queryFn: () => invoke<McpSetup>("get_ai_mcp_setup"),
    retry: false,
  });
  const check = useMutation({
    mutationFn: () => invoke<void>("check_ai_mcp_connection"),
  });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card/60 p-4">
      <div>
        <h4 className="text-sm font-medium"><Trans>Codex and ChatGPT desktop</Trans></h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          <Trans>
            Add this configuration to your Codex host's ~/.codex/config.toml, or use the location set by CODEX_HOME.
            Codex and ChatGPT desktop share this local configuration. Keep your existing servers and replace any
            existing typr_local entry instead of adding a duplicate. Restart your client afterward.
          </Trans>
        </p>
      </div>
      {setup.data && (
        <>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" aria-label={t`Codex MCP configuration`}>
            {setup.data.codex_toml}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy(setup.data.codex_toml)}>
              <Trans>Copy Codex configuration</Trans>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void copy(setup.data.claude_json)}>
              <Trans>Copy Claude configuration</Trans>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <Trans>For manual Claude setup, merge the copied mcpServers entry into Claude Desktop's configuration.</Trans>
          </p>
        </>
      )}
      {setup.isError && <p role="status" className="text-xs text-destructive"><Trans>Could not generate MCP configuration.</Trans></p>}
      {copyStatus && (
        <p role="status" className="text-xs text-muted-foreground">
          {copyStatus === "copied" ? <Trans>Configuration copied.</Trans> : <Trans>Could not copy configuration.</Trans>}
        </p>
      )}
      <div className="space-y-2 border-t pt-3">
        <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? <Trans>Checking local server...</Trans> : <Trans>Check local server</Trans>}
        </Button>
        {check.isSuccess && <p role="status" className="text-xs text-success"><Trans>Local MCP initialization, tool discovery, and database read passed.</Trans></p>}
        {check.isError && <p role="status" className="text-xs text-destructive"><Trans>Local MCP check failed. Confirm the MCP sidecar is installed and open Typr once to prepare the database, then retry.</Trans></p>}
        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans>
            This check runs locally and does not confirm that your AI client has loaded Typr. In your client, enable
            Typr's tools and ask it to list recent sessions, search for a known note, and retrieve it by ID.
            Retrieved notes are shared with the AI provider you choose.
          </Trans>
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <Trans>ChatGPT web needs a separate authenticated remote MCP plugin or secure tunnel. This local connection does not enable web access.</Trans>
        </p>
      </div>
    </div>
  );
}
