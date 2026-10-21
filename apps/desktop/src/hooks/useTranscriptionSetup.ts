import { sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { transcriptionSetupState } from "@/lib/stt-setup";
import { useQuery } from "@tanstack/react-query";
import { type SupportedModel } from "@typr/plugin-local-stt";
import { useModelLifecycle } from "./useModelState";

export function useTranscriptionSetup(model: SupportedModel) {
  const lifecycle = useModelLifecycle("stt");
  const capabilities = useQuery(sttCapabilitiesQueryOptions());
  const state = transcriptionSetupState(model, capabilities.data, lifecycle.data);
  return { ...state, error: state.error ?? capabilities.error?.message ?? lifecycle.error?.message };
}
