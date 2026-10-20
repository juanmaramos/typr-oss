import { modelAvailability, transcriptionModelAvailability } from "@/lib/model-availability";
import { transcriptionModelQueryOptions } from "@/lib/model-selection";
import { sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { useModelLifecycle } from "./useModelState";
import { usePlatform } from "./usePlatform";

export const cloudSttApiKeysQueryOptions = () =>
  queryOptions({
    queryKey: ["cloud-stt-api-keys"],
    queryFn: async () => ({ assemblyai: await connectorCommands.getAssemblyaiApiKey() }),
    staleTime: 30_000,
    retry: false,
  });

export function useTranscriptionAvailability(mode: "live" | "recorded" = "live") {
  const lifecycle = useModelLifecycle("stt");
  const platform = usePlatform();
  const selection = useQuery(transcriptionModelQueryOptions());
  const capabilities = useQuery(sttCapabilitiesQueryOptions());
  const keys = useQuery(cloudSttApiKeysQueryOptions());
  const getAvailability = (id: string) => {
    if (!id.toLowerCase().includes("assemblyai")) {
      if (platform.isError) {
        return modelAvailability("error", "platform-read-failed");
      }
      if (platform.isLoading) {
        return modelAvailability("checking");
      }
      if (!platform.supportsLocalModels) {
        return modelAvailability("unavailable", "local-models-unsupported");
      }
    }
    return transcriptionModelAvailability({
      id,
      mode,
      lifecycle,
      models: lifecycle.data,
      capabilities,
      credentials: { ...keys, hasKey: !!keys.data?.assemblyai.trim() },
    });
  };
  const availability = selection.isError
    ? modelAvailability("error", "selection-read-failed")
    : selection.isPending
    ? modelAvailability("checking", "selection-pending")
    : getAvailability(selection.data);
  const retry = () =>
    Promise.all([platform.refetch(), selection.refetch(), lifecycle.refetch(), capabilities.refetch(), keys.refetch()]);
  return { selectedModel: selection.data, availability, getAvailability, retry };
}
