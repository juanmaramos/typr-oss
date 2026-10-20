import { type QueryClient } from "@tanstack/react-query";
import { commands, type ModelCapabilities, type SupportedModel } from "@typr/plugin-local-stt";
import { type ModelStateMap } from "./model-lifecycle";
import { sttCapabilitiesQueryOptions } from "./stt-capabilities";

/** Download one advertised Whisper recovery model alongside a streaming model. */
export function transcriptionSetupModels(model: SupportedModel, capabilities: readonly ModelCapabilities[]) {
  const capability = capabilities.find(item => item.model === model);
  const fallback = capability?.live_fallback_models[0];
  return fallback ? [model, fallback] : [model];
}

export function transcriptionSetupState(
  model: SupportedModel,
  capabilities: readonly ModelCapabilities[] | undefined,
  states: ModelStateMap | undefined,
) {
  const required = capabilities ? transcriptionSetupModels(model, capabilities) : [];
  const records = required.map(id => states?.[id]);
  return {
    completed: records.length > 0 && records.every(record => record?.isDownloaded),
    progress: records.length
      ? records.reduce((sum, record) => sum + (record?.isDownloaded ? 100 : record?.progress ?? 0), 0) / records.length
      : 0,
    error: records.find(record => record?.error)?.error,
    sizeBytes: required.reduce((sum, id) => sum + (capabilities?.find(item => item.model === id)?.size_bytes ?? 0), 0),
  };
}

export async function downloadTranscriptionSetup(client: QueryClient, model: SupportedModel) {
  const capabilities = await client.ensureQueryData(sttCapabilitiesQueryOptions());
  if (!capabilities.find(item => item.model === model)?.available) {
    throw new Error("stt_model_unavailable");
  }
  for (const required of transcriptionSetupModels(model, capabilities)) {
    const [downloaded, downloading] = await Promise.all([
      commands.isModelDownloaded(required),
      commands.isModelDownloading(required),
    ]);
    if (!downloaded && !downloading) {
      await commands.downloadModelBackground(required);
    }
  }
}
