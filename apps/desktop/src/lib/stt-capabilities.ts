import { queryOptions } from "@tanstack/react-query";
import { commands, type ModelCapabilities } from "@typr/plugin-local-stt";

import { SETTINGS_LOCAL_STT_MODEL_KEYS } from "@/components/transcript/constants/languageData";

export const sttCapabilitiesQueryOptions = () =>
  queryOptions({
    queryKey: ["stt-model-capabilities"],
    queryFn: () => commands.listModelCapabilities(),
    staleTime: 30_000,
  });

export function getAvailableSettingsSttModels(capabilities: readonly ModelCapabilities[] | undefined) {
  return SETTINGS_LOCAL_STT_MODEL_KEYS.filter(model =>
    capabilities
      ? capabilities.some(capability => capability.model === model && capability.available)
      : model !== "Nemotron3p5Streaming"
  );
}
