import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localLlmCommands, type SupportedModel as LocalChatModel } from "@typr/plugin-local-llm";
import { commands as localSttCommands, type SupportedModel as LocalTranscriptionModel } from "@typr/plugin-local-stt";
import { AUTO_CLOUD_MODEL_ID, LEGACY_WINDOWS_DEFAULT_CLOUD_MODEL_ID, normalizeAiTaskDefaults, type AiTaskDefaults } from "@typr/utils";

export const MODEL_SELECTION_CHANGED_EVENT = "model-selection-changed";
export const MODEL_NOT_DOWNLOADED = "model_not_downloaded";
export const CLOUD_TRANSCRIPTION_MODEL = "assemblyai-universal";
export type TranscriptionModel = LocalTranscriptionModel | typeof CLOUD_TRANSCRIPTION_MODEL;

export const modelSelectionKeys = {
  localChat: ["models", "current"],
  cloudChat: ["cloud-model", "current"],
  transcription: ["stt-model-connector"],
  localTranscription: ["stt-local-model"],
  taskDefaults: ["ai-task-defaults"],
  customEndpointEnabled: ["custom-llm-enabled"],
} as const;

export const localChatModelQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.localChat,
  queryFn: () => localLlmCommands.getCurrentModel(),
  staleTime: 30_000,
});
export const cloudChatModelQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.cloudChat,
  queryFn: async () => (await connectorCommands.getCloudModel())?.trim() ?? "",
  staleTime: 30_000,
});
export const transcriptionModelQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.transcription,
  queryFn: async () => {
    const model = (await connectorCommands.getSttModel())?.trim() ?? "";
    if (model === "AssemblyAIUniversal") {
      return CLOUD_TRANSCRIPTION_MODEL;
    }
    return model || await localSttCommands.getCurrentModel();
  },
});
export const localTranscriptionModelQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.localTranscription,
  queryFn: () => localSttCommands.getCurrentModel(),
});
export const customEndpointEnabledQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.customEndpointEnabled,
  queryFn: () => connectorCommands.getCustomLlmEnabled(),
  staleTime: 30_000,
});
export const aiTaskDefaultsQueryOptions = () => queryOptions({
  queryKey: modelSelectionKeys.taskDefaults,
  queryFn: () => connectorCommands.getAiTaskDefaults(),
});

export async function refreshModelSelection(queryClient: QueryClient) {
  await Promise.all(Object.values(modelSelectionKeys).map(queryKey =>
    queryClient.invalidateQueries({ queryKey, refetchType: "all" })
  ));
}

// Keep read/modify/write task updates and local/cloud transitions in user-action order.
// Native commands own persistence; this queue coordinates this webview's callers.
let selectionQueue: Promise<unknown> = Promise.resolve();
const controllers = new WeakMap<QueryClient, ReturnType<typeof createModelSelectionController>>();

export function getModelSelectionController(queryClient: QueryClient) {
  let controller = controllers.get(queryClient);
  if (!controller) {
    controller = createModelSelectionController(queryClient);
    controllers.set(queryClient, controller);
  }
  return controller;
}

function createModelSelectionController(queryClient: QueryClient) {
  function update(operation: () => Promise<void>) {
    const result = selectionQueue.then(async () => {
      try {
        await operation();
      } finally {
        // Re-read even after a partial write or failed server restart. Never leave
        // an optimistic selection displayed when persistence rejected it.
        await refreshModelSelection(queryClient);
        await emit(MODEL_SELECTION_CHANGED_EVENT).catch(console.error);
      }
    });
    selectionQueue = result.catch(() => {});
    return result;
  }

  async function setLocalChat(model: LocalChatModel, startServer = false) {
    if (!await localLlmCommands.isModelDownloaded(model)) {
      throw new Error(MODEL_NOT_DOWNLOADED);
    }
    const previousModel = await localLlmCommands.getCurrentModel();
    const running = await localLlmCommands.isServerRunning();
    // Preserve the cloud/Auto preference if saving the local model fails.
    await localLlmCommands.setCurrentModel(model);
    if (running && previousModel !== model) {
      await localLlmCommands.restartServer();
    } else if (!running && startServer) {
      await localLlmCommands.startServer();
    }
    await connectorCommands.setCustomLlmEnabled(false);
    await connectorCommands.setCloudModel("");
  }

  async function setTranscription(model: TranscriptionModel, startServer = false) {
    if (model === CLOUD_TRANSCRIPTION_MODEL) {
      await connectorCommands.setSttModel(model);
      return;
    }
    if (!await localSttCommands.isModelDownloaded(model)) {
      throw new Error(MODEL_NOT_DOWNLOADED);
    }
    const previousModel = await localSttCommands.getCurrentModel();
    const running = await localSttCommands.isServerRunning();
    // This native command writes the connector preference and legacy local store.
    await localSttCommands.setCurrentModel(model);
    if (running && previousModel !== model) {
      await localSttCommands.restartServer();
    } else if (!running && startServer) {
      await localSttCommands.startServer();
    }
  }

  return {
    selectLocalChat: (model: LocalChatModel) => update(() => setLocalChat(model)),
    selectCloudChat: (model: string) => update(async () => {
      await connectorCommands.setCloudModel(model);
    }),
    selectTranscription: (model: TranscriptionModel) => update(() => setTranscription(model)),
    // Downloads retain the existing auto-select + warm-server policy, through
    // exactly the same selection path as the manual pickers.
    completeChatDownload: (model: LocalChatModel) => update(() => setLocalChat(model, true)),
    completeTranscriptionDownload: (model: LocalTranscriptionModel) => update(() => setTranscription(model, true)),
    setTaskDefault: (task: keyof AiTaskDefaults, model: string | null) => update(async () => {
      const defaults = normalizeAiTaskDefaults(await connectorCommands.getAiTaskDefaults());
      await connectorCommands.setAiTaskDefaults(normalizeAiTaskDefaults({ ...defaults, [task]: model }));
    }),
    initializePlatformDefaults: (platform: string) => update(async () => {
      if (platform !== "windows") {
        return;
      }
      const sttModel = await connectorCommands.getSttModel();
      if (!sttModel || !sttModel.includes("assemblyai")) {
        await setTranscription(CLOUD_TRANSCRIPTION_MODEL);
      }
      const chatModel = await connectorCommands.getCloudModel();
      if (!chatModel || chatModel === "groq-openai/gpt-oss-20b" || chatModel === LEGACY_WINDOWS_DEFAULT_CLOUD_MODEL_ID) {
        await connectorCommands.setCloudModel(AUTO_CLOUD_MODEL_ID);
      }
    }),
  };
}
