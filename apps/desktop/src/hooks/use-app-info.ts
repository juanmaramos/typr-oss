import { useQuery } from "@tanstack/react-query";
import { getName, getVersion } from "@tauri-apps/api/app";

export function useAppInfo() {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: async () => {
      const [name, version] = await Promise.all([getName(), getVersion()]);
      return { name, version };
    },
    staleTime: Infinity,
  });
}
