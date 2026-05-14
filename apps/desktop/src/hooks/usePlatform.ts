import { useQuery } from "@tanstack/react-query";
import { type as getOsType } from "@tauri-apps/plugin-os";

export function usePlatform() {
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
    // Remove placeholderData to avoid type issues - React Query handles undefined naturally
  });

  const isLoaded = osType.data !== null && osType.data !== undefined;

  return {
    isWindows: osType.data === "windows",
    isMac: osType.data === "macos",
    // Default to FALSE until loaded to prevent showing local models prematurely
    supportsLocalModels: isLoaded ? osType.data === "macos" : false,
    isLoading: osType.isLoading || !isLoaded,
  };
}
