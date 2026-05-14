import { commands as flagsCommands } from "@typr/plugin-flags";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to check if the tags system is enabled
 * @returns {boolean} Whether tags feature is enabled
 */
export function useTagsFeature(): boolean {
  const { data: isEnabled = false } = useQuery({
    queryKey: ["feature-flag", "TagsSystem"],
    queryFn: () => flagsCommands.isEnabled("TagsSystem"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return isEnabled;
}
