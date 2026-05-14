import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localLlmCommands } from "@typr/plugin-local-llm";
import { commands as localSttCommands } from "@typr/plugin-local-stt";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { safeUnlisten } from "@/utils/safe-unlisten";

export interface ModelStateEvent {
  model_id: string;
  state: "NotDownloaded" | { Downloading: { progress: number } } | "Downloaded" | { Error: { message: string } };
  timestamp: number;
}

export interface LlmModelStateEvent {
  model_id: string;
  state: "NotDownloaded" | { Downloading: { progress: number } } | "Downloaded" | "Loading" | "Ready" | {
    Error: { message: string };
  };
  timestamp: number;
}

export interface ModelInfo {
  id: string;
  isDownloaded: boolean;
  isDownloading: boolean;
  isLoading: boolean;
  isReady: boolean;
  progress: number;
  error?: string;
  lastUpdated: number;
}

type ModelStateMap = Record<string, ModelInfo>;

interface SttSelectionEvent {
  local_model: string | null;
  cloud_model: string | null;
}

export function useModelState() {
  const [models, setModels] = useState<ModelStateMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocalModel, setSelectedLocalModel] = useState<string | null>(null);
  const [selectedCloudModel, setSelectedCloudModel] = useState<string | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(true);

  // Load initial model selection and listen for changes
  useEffect(() => {
    let disposed = false;
    let selectionUnlisten: UnlistenFn;

    const setup = async () => {
      try {
        // Load initial selection state
        const [currentLocal, currentCloud] = await Promise.all([
          localSttCommands.getCurrentModel().catch(() => null),
          connectorCommands.getSttModel().catch(() => ""),
        ]);

        if (!disposed) {
          if (currentLocal) {
            setSelectedLocalModel(currentLocal.toString());
          }
          if (currentCloud && currentCloud.trim() !== "") {
            const isCloud = currentCloud.includes("assemblyai");
            if (isCloud) {
              setSelectedCloudModel(currentCloud);
            } else {
              // connector store has a local model key
              setSelectedLocalModel(currentCloud);
            }
          }
          debugLogFor("DEBUG_MODEL", "ModelDebug", "init", { local: currentLocal?.toString(), cloud: currentCloud });
          setSelectionLoading(false);
        }

        // Listen for selection changes from backend
        selectionUnlisten = await listen<SttSelectionEvent>("stt-model-selection-changed", (event) => {
          const { local_model, cloud_model } = event.payload;
          debugLogFor("DEBUG_MODEL", "ModelDebug", "selection changed", { local_model, cloud_model });
          if (local_model) {
            setSelectedLocalModel(local_model);
            setSelectedCloudModel(null);
          } else if (cloud_model) {
            setSelectedCloudModel(cloud_model);
            setSelectedLocalModel(null);
          }
        });
        if (disposed) {
          safeUnlisten(selectionUnlisten, "useModelState.selection.listener.late-dispose");
        }
      } catch (error) {
        console.error("Failed to setup model selection listener:", error);
        if (!disposed) {
          setSelectionLoading(false);
        }
      }
    };

    setup();

    return () => {
      disposed = true;
      safeUnlisten(selectionUnlisten, "useModelState.selection.listener");
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let sttUnlisten: UnlistenFn;
    let llmUnlisten: UnlistenFn;

    const setupListener = async () => {
      try {
        // Load initial state for both STT and LLM models
        const initialState = await loadInitialModelState();
        setModels(initialState);
        setIsLoading(false);

        // Listen for STT events
        sttUnlisten = await listen<ModelStateEvent>("stt-model-state-changed", (event) => {
          const { model_id, state, timestamp } = event.payload;

          setModels(prev => ({
            ...prev,
            [model_id]: {
              id: model_id,
              isDownloaded: state === "Downloaded",
              isDownloading: typeof state === "object" && "Downloading" in state,
              isLoading: false,
              isReady: false,
              progress: typeof state === "object" && "Downloading" in state ? state.Downloading.progress : 0,
              error: typeof state === "object" && "Error" in state ? state.Error.message : undefined,
              lastUpdated: timestamp,
            },
          }));
        });
        if (disposed) {
          safeUnlisten(sttUnlisten, "useModelState.stt.listener.late-dispose");
          return;
        }

        // Listen for LLM events
        llmUnlisten = await listen<LlmModelStateEvent>("llm-model-state-changed", (event) => {
          const { model_id, state, timestamp } = event.payload;
          const isDownloadingState = typeof state === "object" && "Downloading" in state;
          const isErrorState = typeof state === "object" && "Error" in state;

          setModels(prev => {
            const previous = prev[model_id];
            const isDownloaded = state === "Downloaded"
              || state === "Loading"
              || state === "Ready"
              || (isDownloadingState ? false : previous?.isDownloaded || false);

            return {
              ...prev,
              [model_id]: {
                id: model_id,
                isDownloaded,
                isDownloading: isDownloadingState,
                isLoading: state === "Loading",
                isReady: state === "Ready",
                progress: isDownloadingState ? state.Downloading.progress : previous?.progress || 0,
                error: isErrorState ? state.Error.message : undefined,
                lastUpdated: timestamp,
              },
            };
          });
        });
        if (disposed) {
          safeUnlisten(llmUnlisten, "useModelState.llm.listener.late-dispose");
          return;
        }
      } catch (error) {
        console.error("Failed to setup model state listener:", error);
        safeUnlisten(sttUnlisten, "useModelState.stt.listener.setup-failure");
        safeUnlisten(llmUnlisten, "useModelState.llm.listener.setup-failure");
        setIsLoading(false);
      }
    };

    setupListener();

    return () => {
      disposed = true;
      safeUnlisten(sttUnlisten, "useModelState.stt.listener");
      safeUnlisten(llmUnlisten, "useModelState.llm.listener");
    };
  }, []);

  // Memoize helper functions to prevent infinite re-renders in components
  const getModel = useCallback((id: string) => models[id], [models]);
  const isDownloaded = useCallback((id: string) => models[id]?.isDownloaded || false, [models]);
  const isDownloading = useCallback((id: string) => models[id]?.isDownloading || false, [models]);
  const isModelLoading = useCallback((id: string) => models[id]?.isLoading || false, [models]);
  const isReady = useCallback((id: string) => models[id]?.isReady || false, [models]);
  const getProgress = useCallback((id: string) => models[id]?.progress || 0, [models]);
  const getError = useCallback((id: string) => models[id]?.error, [models]);

  // Single source of truth: is an STT model available for transcription?
  const isSttModelAvailable = useMemo(() => {
    let available = false;
    if (selectedCloudModel) {
      available = true;
    } else if (selectedLocalModel) {
      available = models[selectedLocalModel]?.isDownloaded || false;
    }
    debugLogFor("DEBUG_MODEL", "ModelDebug", "availability", { available, selectedLocalModel, selectedCloudModel });
    return available;
  }, [selectedCloudModel, selectedLocalModel, models]);

  const isSttLoading = isLoading || selectionLoading;

  return {
    models: Object.values(models),
    getModel,
    isLoading,
    // STT model availability (single source of truth)
    isSttModelAvailable,
    isSttLoading,
    selectedLocalModel,
    selectedCloudModel,
    // Convenience helpers
    isDownloaded,
    isDownloading,
    isModelLoading,
    isReady,
    getProgress,
    getError,
  };
}

async function loadInitialModelState(): Promise<ModelStateMap> {
  try {
    const modelStates: Record<string, ModelInfo> = {};

    // Load STT models
    try {
      const sttModels = await localSttCommands.listSupportedModels();
      const sttStates = await Promise.all(
        sttModels.map(async (model) => {
          const [isDownloaded, isDownloading] = await Promise.all([
            localSttCommands.isModelDownloaded(model),
            localSttCommands.isModelDownloading(model),
          ]);
          return {
            id: model.toString(),
            isDownloaded,
            isDownloading,
            isLoading: false,
            isReady: false,
            progress: 0,
            lastUpdated: Date.now(),
          };
        }),
      );

      sttStates.forEach(state => {
        modelStates[state.id] = state;
      });
    } catch (error) {
      console.error("Failed to load STT models:", error);
    }

    // Load LLM models
    try {
      const llmModels = await localLlmCommands.listSupportedModels();
      const llmStates = await Promise.all(
        llmModels.map(async (model) => {
          const [isDownloaded, isDownloading] = await Promise.all([
            localLlmCommands.isModelDownloaded(model.id),
            localLlmCommands.isModelDownloading(model.id),
          ]);
          return {
            id: model.id.toString(),
            isDownloaded,
            isDownloading,
            isLoading: false,
            isReady: false, // Will be updated via events
            progress: 0,
            lastUpdated: Date.now(),
          };
        }),
      );

      llmStates.forEach(state => {
        modelStates[state.id] = state;
      });
    } catch (error) {
      console.error("Failed to load LLM models:", error);
    }

    return modelStates;
  } catch (error) {
    console.error("Failed to load initial model state:", error);
    return {};
  }
}
