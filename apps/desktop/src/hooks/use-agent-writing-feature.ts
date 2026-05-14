import { commands as flagsCommands } from "@typr/plugin-flags";
import { useQuery } from "@tanstack/react-query";

import { FEATURES } from "@/lib/features";

/**
 * Feature flag hook for Agent Writing Selection functionality
 * Controls access to Cursor-like text editing features (Edit mode + CMD+L selection editing)
 */
export function useAgentWritingFeature(): boolean {
  const { data: isEnabled = false } = useQuery({
    queryKey: ["feature-flag", "AgentWritingChat"],
    queryFn: () => flagsCommands.isEnabled("AgentWritingChat"),
    enabled: FEATURES.ENABLE_AGENT_WRITING_ASSISTANT,
    staleTime: 0, // No caching - feature flags should reflect changes immediately
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on component mount
  });

  return FEATURES.ENABLE_AGENT_WRITING_ASSISTANT && isEnabled;
}
