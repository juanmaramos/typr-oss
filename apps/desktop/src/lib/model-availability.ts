import type { ModelCapabilities } from "@typr/plugin-local-stt";
import type { ModelInfo, ModelStateMap } from "./model-lifecycle";

export type ModelStatus =
  | "checking"
  | "error"
  | "needs-download"
  | "downloading"
  | "loading"
  | "ready"
  | "needs-api-key"
  | "unavailable";
export interface ModelAvailability {
  status: ModelStatus;
  reason: string;
  canStart: boolean;
  canSelect: boolean;
  canDownload: boolean;
  canConfigure: boolean;
  canRetry: boolean;
  progress: number;
}
export interface AvailabilityRead {
  isPending: boolean;
  isError: boolean;
}
export function modelAvailability(
  status: ModelStatus,
  reason: string = status,
  overrides: Partial<ModelAvailability> = {},
): ModelAvailability {
  return {
    status,
    reason,
    canStart: status === "ready",
    canSelect: status === "ready",
    canDownload: status === "needs-download",
    canConfigure: true,
    canRetry: status === "error",
    progress: 0,
    ...overrides,
  };
}
export function localModelAvailability(read: AvailabilityRead, model: ModelInfo | undefined): ModelAvailability {
  if (read.isError) {
    return modelAvailability("error", "lifecycle-read-failed");
  }
  if (read.isPending) {
    return modelAvailability("checking");
  }
  if (!model) {
    return modelAvailability("unavailable", "unknown-model");
  }
  if (model.isDownloading) {
    return modelAvailability("downloading", "downloading", { progress: model.progress });
  }
  if (model.isLoading) {
    return modelAvailability("loading");
  }
  if (model.error) {
    return modelAvailability("error", "model-operation-failed", {
      // Downloaded artifacts can retry native initialization; a failed download can be restarted.
      canStart: model.isDownloaded,
      canSelect: model.isDownloaded,
      canDownload: !model.isDownloaded,
    });
  }
  return modelAvailability(model.isDownloaded ? "ready" : "needs-download");
}
export function cloudModelAvailability(read: AvailabilityRead, hasKey: boolean): ModelAvailability {
  if (read.isError) {
    return modelAvailability("error", "credentials-read-failed");
  }
  if (read.isPending) {
    return modelAvailability("checking");
  }
  return modelAvailability(hasKey ? "ready" : "needs-api-key");
}

export function transcriptionModelAvailability(input: {
  id: string | undefined;
  mode: "live" | "recorded";
  lifecycle: AvailabilityRead;
  models: ModelStateMap | undefined;
  capabilities: AvailabilityRead & { data?: ModelCapabilities[] };
  credentials: AvailabilityRead & { hasKey: boolean };
}): ModelAvailability {
  const { id, mode, lifecycle, models, capabilities, credentials } = input;
  if (!id) {
    return modelAvailability("checking", "selection-pending");
  }
  if (id.toLowerCase().includes("assemblyai")) {
    return cloudModelAvailability(credentials, credentials.hasKey);
  }
  if (capabilities.isError) {
    return modelAvailability("error", "capabilities-read-failed");
  }
  if (capabilities.isPending) {
    return modelAvailability("checking");
  }
  const capability = capabilities.data?.find(item => item.model === id);
  if (!capability) {
    return modelAvailability("unavailable", "unknown-model");
  }
  const selected = localModelAvailability(lifecycle, models?.[id]);
  if (selected.status === "checking" || selected.status === "loading" || selected.reason === "lifecycle-read-failed") {
    return selected;
  }
  const usableDirectly = capability.available && (mode === "live" || capability.recorded);
  if (usableDirectly && selected.canStart) {
    return selected;
  }
  const candidates = mode === "live" ? capability.live_fallback_models : capability.recorded_fallback_models;
  // Native metadata owns the fallback order. Rust validates initialization, languages and integrity at start.
  const fallback = candidates.find(candidate => localModelAvailability(lifecycle, models?.[candidate]).canStart);
  if (fallback) {
    return modelAvailability("ready", "native-fallback", {
      canSelect: selected.canSelect && capability.available,
      canDownload: selected.canDownload,
      canRetry: selected.canRetry,
      progress: selected.progress,
    });
  }
  if (!usableDirectly) {
    return modelAvailability(
      "unavailable",
      mode === "recorded" ? "recorded-fallback-required" : "backend-unavailable",
      {
        canSelect: selected.canSelect && capability.available,
      },
    );
  }
  return selected;
}
