import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const claudeMcpStatusQueryKey = ["claude-mcp-status"] as const;

export function useClaudeMcpStatus(enabled = true) {
  return useQuery({
    queryKey: claudeMcpStatusQueryKey,
    queryFn: () => invoke<boolean>("check_claude_mcp_status"),
    enabled,
    staleTime: 0,
    retry: false,
  });
}
