// @vitest-environment jsdom
import { messages as enMessages } from "@/locales/en/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, createContext, type ReactNode, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  stt: "QuantizedLargeTurbo",
  chat: "Gemma4E4b",
  cloud: "auto",
  customEnabled: false,
  runningChat: false,
  runningStt: false,
  unavailableStt: new Set<string>(),
  noDownloadedModels: false,
  lifecycleStatus: "ready" as "ready" | "checking" | "error",
  lifecycleRetries: 0,
  registryStatus: "ready" as "ready" | "checking" | "read-error" | "download-error" | "runtime-error",
  defaults: { project_brief_model_id: null, meeting_summary_model_id: null } as {
    project_brief_model_id: string | null;
    meeting_summary_model_id: string | null;
  },
  listeners: new Map<string, Set<() => void>>(),
}));
vi.mock("@typr/plugin-connector", () => ({
  commands: {
    getSttModel: vi.fn(async () => native.stt),
    setSttModel: vi.fn(async (model: string) => {
      native.stt = model;
    }),
    getCloudModel: vi.fn(async () => native.cloud),
    setCloudModel: vi.fn(async (model: string) => {
      native.cloud = model;
    }),
    getCustomLlmEnabled: vi.fn(async () => native.customEnabled),
    setCustomLlmEnabled: vi.fn(async (enabled: boolean) => {
      native.customEnabled = enabled;
      return null;
    }),
    getLlmConnection: vi.fn(),
    getAiTaskDefaults: vi.fn(async () => ({ ...native.defaults })),
    setAiTaskDefaults: vi.fn(async (defaults: typeof native.defaults) => {
      native.defaults = defaults;
    }),
    getAssemblyaiApiKey: vi.fn(async () => "configured-key"),
    getOpenaiApiKey: vi.fn(async () => ""),
    getGroqApiKey: vi.fn(async () => ""),
    getOpenrouterApiKey: vi.fn(async () => ""),
  },
}));
vi.mock("@typr/plugin-local-stt", () => ({
  commands: {
    listModelCapabilities: vi.fn(async () =>
      [
        "QuantizedTiny",
        "QuantizedTinyEn",
        "QuantizedBase",
        "QuantizedBaseEn",
        "QuantizedSmall",
        "QuantizedSmallEn",
        "QuantizedLargeTurbo",
        "DistilLargeV35En",
        "Nemotron3p5Streaming",
      ].map(model => ({
        model,
        backend: model === "Nemotron3p5Streaming" ? "NemotronStreaming" : "Whisper",
        available: true,
        realtime: model === "Nemotron3p5Streaming",
        recorded: model !== "Nemotron3p5Streaming",
        size_bytes: 1,
        supported_languages: null,
        supported_locales: null,
        live_fallback_models: [],
        recorded_fallback_models: [],
      }))
    ),
    getCurrentModel: vi.fn(async () =>
      native.stt === "assemblyai-universal" ? "QuantizedLargeTurbo" : native.stt || "QuantizedBaseEn"
    ),
    setCurrentModel: vi.fn(async (model: string) => {
      native.stt = model;
    }),
    isModelDownloaded: vi.fn(async () => true),
    isModelDownloading: vi.fn(async () => false),
    isServerRunning: vi.fn(async () => native.runningStt),
    startServer: vi.fn(async () => "local"),
    restartServer: vi.fn(async () => "local"),
    downloadModelBackground: vi.fn(async () => null),
  },
}));
vi.mock("@typr/plugin-local-llm", () => ({
  commands: {
    getCurrentModel: vi.fn(async () => native.chat),
    setCurrentModel: vi.fn(async (model: string) => {
      native.chat = model;
    }),
    isModelDownloaded: vi.fn(async () => true),
    isServerRunning: vi.fn(async () => native.runningChat),
    startServer: vi.fn(async () => "local"),
    restartServer: vi.fn(async () => "local"),
    listSupportedModels: vi.fn(async () => []),
    downloadModelBackground: vi.fn(async () => null),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async (event: string, listener: () => void) => {
    const listeners = native.listeners.get(event) ?? new Set();
    listeners.add(listener);
    native.listeners.set(event, listeners);
    return () => {
      listeners.delete(listener);
    };
  }),
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: null }) }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));
vi.mock("@/utils/open-settings-window", () => ({ openSettingsWindow: vi.fn() }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/hooks/usePlatform", () => ({ usePlatform: () => ({ supportsLocalModels: true, refetch: vi.fn() }) }));
vi.mock("@/hooks/useModelState", () => ({
  useModelLifecycle: (domain: "stt" | "llm") => {
    const ids = domain === "stt"
      ? [
        "QuantizedTiny",
        "QuantizedTinyEn",
        "QuantizedBase",
        "QuantizedBaseEn",
        "QuantizedSmall",
        "QuantizedSmallEn",
        "QuantizedLargeTurbo",
        "DistilLargeV35En",
        "Nemotron3p5Streaming",
      ]
      : ["Gemma4E4b"];
    const data = Object.fromEntries(ids.map(id => [id, {
      id,
      isDownloaded: !native.noDownloadedModels && !native.unavailableStt.has(id),
      isDownloading: false,
      isLoading: false,
      isReady: false,
      progress: 0,
      lastUpdated: 0,
    }]));
    return {
      data: native.lifecycleStatus === "checking" ? undefined : data,
      getModel: (id: string) => data[id],
      isPending: native.lifecycleStatus === "checking",
      isError: native.lifecycleStatus === "error",
      error: native.lifecycleStatus === "error" ? new Error("native read failed") : null,
      refetch: async () => {
        native.lifecycleRetries++;
      },
    };
  },
  useModelState: () => ({
    stt: { models: [{ isDownloaded: !native.noDownloadedModels }] },
    llm: { models: [{ isDownloaded: !native.noDownloadedModels }] },
    models: [],
    isLoading: false,
    getModel: (id: string) => ({
      isDownloaded: !native.noDownloadedModels && !native.unavailableStt.has(id),
      isDownloading: false,
    }),
  }),
}));
vi.mock("@/hooks/useModelRegistry", () => ({
  useModelRegistry: () => {
    const canSelect = native.registryStatus === "ready" || native.registryStatus === "runtime-error";
    const model = {
      id: "Gemma4E4b",
      name: "Gemma 4",
      icon: "ri-google-fill",
      isDownloaded: canSelect,
      show_in_selector: true,
      availability: {
        status: native.registryStatus === "checking"
          ? "checking"
          : native.registryStatus === "ready"
          ? "ready"
          : "error",
        reason: native.registryStatus,
        canStart: canSelect,
        canSelect,
        canDownload: native.registryStatus === "download-error",
        canConfigure: true,
        canRetry: native.registryStatus.endsWith("error"),
        progress: 0,
      },
    };
    return {
      models: [model],
      selectableModels: [model],
      isLoading: native.registryStatus === "checking",
      error: native.registryStatus === "read-error" ? new Error("metadata read failed") : null,
      refetch: () => {
        native.lifecycleRetries++;
      },
    };
  },
}));
vi.mock("@/hooks/useOpenAIModels", () => ({ useOpenAIModels: () => ({ models: [], isLoading: false }) }));
vi.mock("@/hooks/useGroqModels", () => ({ useGroqModels: () => ({ models: [], isLoading: false }) }));
vi.mock("@/hooks/useOpenRouterModels", () => ({ useOpenRouterModels: () => ({ models: [], isLoading: false }) }));
vi.mock("@/components/settings/components/wer-modal", () => ({ WERPerformanceModal: () => null }));
vi.mock("@typr/ui/components/ui/toast", () => ({
  toast: vi.fn(),
  sonnerToast: { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock("@typr/ui/components/ui/select", () => {
  const Selection = createContext<(value: string) => void>(() => {});
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Select: (
      { value, onValueChange, children }: {
        value: string;
        onValueChange: (value: string) => void;
        children: ReactNode;
      },
    ) => (
      <Selection.Provider value={onValueChange}>
        <div data-selection={value}>{children}</div>
      </Selection.Provider>
    ),
    SelectItem: ({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) => {
      const change = useContext(Selection);
      return <button disabled={disabled} data-option={value} onClick={() => change(value)}>{children}</button>;
    },
    SelectContent: Container,
    SelectTrigger: ({ children }: { children: ReactNode }) => <div data-testid="model-trigger">{children}</div>,
    SelectValue: Container,
  };
});

import { LLMLocalView } from "@/components/settings/components/ai/llm-local-view";
import { STTView } from "@/components/settings/components/ai/stt-view";
import { AiTaskDefaultsSettings } from "@/components/settings/components/ai/task-defaults";
import ModelDownloadNotification from "@/components/toast/model-download";
import { showLlmModelDownloadToast, showSttModelDownloadToast } from "@/components/toast/shared";
import { useSTTModel } from "@/components/transcript/hooks/useSTTModel";
import { useCloudModelSelection } from "@/hooks/useCloudModelSelection";
import { useLocalModels } from "@/hooks/useModels";
import { useModelSelectionSync } from "@/hooks/useModelSelectionSync";
import { listen } from "@tauri-apps/api/event";
import { commands as connector } from "@typr/plugin-connector";
import { commands as llm } from "@typr/plugin-local-llm";
import { commands as stt } from "@typr/plugin-local-stt";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";
import { modelLifecycleKey } from "./model-lifecycle";
import {
  cloudChatModelQueryOptions,
  getModelSelectionController,
  localChatModelQueryOptions,
  MODEL_SELECTION_CHANGED_EVENT,
  modelSelectionKeys,
  transcriptionModelQueryOptions,
} from "./model-selection";

let queryClient: QueryClient;
let root: Root;
let container: HTMLDivElement;

function Pickers() {
  return (
    <>
      <AiTaskDefaultsSettings />
      <div data-testid="stt-cards">
        <STTView
          sttModels={[
            {
              key: "QuantizedLargeTurbo",
              name: "Turbo",

              size: "574 MB",
              downloaded: true,
              fileName: "",
            },
            {
              key: "DistilLargeV35En",
              name: "English",

              size: "1.5 GB",
              downloaded: true,
              fileName: "",
            },
          ]}
          handleModelDownload={async () => {}}
          handleShowFileLocation={async () => {}}
          supportsLocalModels
          isWerModalOpen={false}
          setIsWerModalOpen={() => {}}
        />
      </div>
    </>
  );
}

async function render(children: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
      </QueryClientProvider>,
    );
  });
}
async function settle(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assertion();
  });
}

beforeEach(() => {
  i18n.load("en", enMessages);
  i18n.activate("en");
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
  native.stt = "QuantizedLargeTurbo";
  native.chat = "Gemma4E4b";
  native.cloud = "auto";
  native.customEnabled = false;
  native.runningChat = false;
  native.runningStt = false;
  native.unavailableStt.clear();
  native.noDownloadedModels = false;
  native.lifecycleStatus = "ready";
  native.lifecycleRetries = 0;
  native.registryStatus = "ready";
  native.defaults = { project_brief_model_id: null, meeting_summary_model_id: null };
  native.listeners.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setNotifyFunction(callback => act(() => callback()));
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  container.remove();
  notifyManager.setNotifyFunction(callback => callback());
  vi.unstubAllGlobals();
});

describe("model selection ownership", () => {
  it("keeps default picker icons synchronized with Chat selection and distinct from inherited tasks", async () => {
    await render(<AiTaskDefaultsSettings />);
    const triggers = () => [...container.querySelectorAll("[data-testid=\"model-trigger\"]")];
    await settle(() => expect(triggers()[0].textContent).toBe("Auto"));
    expect(triggers()[0].querySelector(".ri-sparkling-fill[aria-hidden=\"true\"]")).not.toBeNull();
    for (const trigger of triggers().slice(1, 3)) {
      expect(trigger.textContent).toBe("Follow Chat and Ask");
      expect(trigger.querySelector(".ri-chat-ai-line[aria-hidden=\"true\"]")).not.toBeNull();
      expect(trigger.querySelector(".ri-google-fill")).toBeNull();
    }
    const localOption = container.querySelector("[data-option=\"local-Gemma4E4b\"]") as HTMLButtonElement;
    await act(async () => localOption.click());
    await settle(() => expect(triggers()[0].textContent).toBe("Gemma 4"));
    expect(triggers()[0].querySelector(".ri-google-fill[aria-hidden=\"true\"]")).not.toBeNull();
    expect(triggers()[0].querySelector(".ri-sparkling-fill")).toBeNull();
    expect(triggers()[3].querySelector("[data-stt-provider=\"OpenAI\"]")).not.toBeNull();
    const autoOption = container.querySelector("[data-option=\"auto\"]") as HTMLButtonElement;
    await act(async () => autoOption.click());
    await settle(() => expect(triggers()[0].textContent).toBe("Auto"));
    expect(triggers()[0].querySelector(".ri-sparkling-fill")).not.toBeNull();
    expect(triggers()[0].querySelector(".ri-google-fill")).toBeNull();
  });

  it("shows semantic icons for Auto task overrides and saved models absent from the catalog", async () => {
    native.defaults = { project_brief_model_id: "auto", meeting_summary_model_id: "openai-saved-model" };
    await render(<AiTaskDefaultsSettings />);
    await settle(() => {
      const triggers = [...container.querySelectorAll("[data-testid=\"model-trigger\"]")];
      expect(triggers[1].textContent).toBe("Auto");
      expect(triggers[1].querySelector(".ri-sparkling-fill")).not.toBeNull();
      expect(triggers[2].textContent).toBe("saved-model");
      expect(triggers[2].querySelector(".ri-robot-line")).not.toBeNull();
    });
  });

  it("keeps local chat downloads unavailable while lifecycle data is checking", async () => {
    native.registryStatus = "checking";
    await render(
      <LLMLocalView handleModelDownload={async () => {}} handleShowFileLocation={async () => {}} supportsLocalModels />,
    );
    expect(container.querySelector(".ri-download-line")).toBeNull();
    expect(container.textContent).toContain("Loading models");
  });

  it.each(["read-error", "download-error", "runtime-error"] as const)(
    "retries local chat %s through the appropriate central action",
    async status => {
      native.registryStatus = status;
      const download = vi.fn(async () => {});
      await render(
        <LLMLocalView handleModelDownload={download} handleShowFileLocation={async () => {}} supportsLocalModels />,
      );
      const retry = [...container.querySelectorAll("button")].find(button =>
        button.textContent === "Retry"
      ) as HTMLButtonElement;
      expect(retry).toBeDefined();
      await act(async () => retry.click());
      if (status === "download-error") {
        expect(download).toHaveBeenCalledWith("Gemma4E4b");
      } else if (status === "runtime-error") {
        expect(llm.setCurrentModel).toHaveBeenCalledWith("Gemma4E4b");
      } else {
        expect(native.lifecycleRetries).toBeGreaterThan(0);
      }
    },
  );

  it("shows checking state rather than missing downloads and prevents unknown defaults selection", async () => {
    native.lifecycleStatus = "checking";
    await render(<Pickers />);
    await settle(() => expect(container.querySelector("[data-option=\"DistilLargeV35En\"]")).not.toBeNull());
    const option = container.querySelector("[data-option=\"DistilLargeV35En\"]") as HTMLButtonElement;
    expect(option.disabled).toBe(true);
    expect(option.textContent).not.toContain("Not downloaded");
    const cards = container.querySelector("[data-testid=\"stt-cards\"]")!;
    expect([...cards.querySelectorAll("button")].some(button => button.textContent === "Use")).toBe(false);
    expect(cards.querySelector(".ri-download-line")).toBeNull();
    expect(cards.querySelector(".ri-loader-4-line")).not.toBeNull();
  });

  it("offers a read retry instead of Download or Use when the native lifecycle snapshot fails", async () => {
    native.lifecycleStatus = "error";
    await render(<Pickers />);
    await settle(() => expect(container.querySelector("[data-option=\"DistilLargeV35En\"]")).not.toBeNull());
    const cards = container.querySelector("[data-testid=\"stt-cards\"]")!;
    const retry = [...cards.querySelectorAll("button")].find(button =>
      button.textContent === "Retry"
    ) as HTMLButtonElement;
    expect(retry).toBeDefined();
    expect(cards.querySelector(".ri-download-line")).toBeNull();
    expect((container.querySelector("[data-option=\"DistilLargeV35En\"]") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => retry.click());
    expect(native.lifecycleRetries).toBeGreaterThan(0);
  });

  it("keeps the real transcription Use card and Defaults picker synchronized in both directions", async () => {
    await render(<Pickers />);
    await settle(() => expect(container.querySelector("[data-option=\"DistilLargeV35En\"]")).not.toBeNull());
    const useButton = [...container.querySelectorAll("[data-testid=\"stt-cards\"] button")]
      .find(button => button.textContent === "Use") as HTMLButtonElement;
    expect(useButton).toBeDefined();
    await act(async () => useButton.click());
    await settle(() => expect(container.querySelector("[data-selection=\"DistilLargeV35En\"]")).not.toBeNull());
    expect(queryClient.getQueryData(modelSelectionKeys.transcription)).toBe("DistilLargeV35En");
    await act(async () =>
      (container.querySelector("[data-option=\"QuantizedLargeTurbo\"]") as HTMLButtonElement).click()
    );
    await settle(() => expect(container.querySelector("[data-selection=\"QuantizedLargeTurbo\"]")).not.toBeNull());
    const cards = container.querySelector("[data-testid=\"stt-cards\"]")!;
    const turbo = [...cards.querySelectorAll("span")].find(span => span.textContent === "Whisper Large v3 Turbo")!;
    expect(turbo.parentElement?.parentElement?.parentElement?.textContent).toContain("Current");
    expect(stt.setCurrentModel).toHaveBeenLastCalledWith("QuantizedLargeTurbo");
  });

  it("shows the saved unavailable transcription default instead of substituting a downloaded model", async () => {
    native.stt = "QuantizedSmall";
    native.unavailableStt.add("QuantizedSmall");
    await render(<Pickers />);
    await settle(() => expect(container.querySelector("[data-selection=\"QuantizedSmall\"]")).not.toBeNull());
    expect(container.querySelector("[data-selection=\"QuantizedLargeTurbo\"]")).toBeNull();
    expect(stt.setCurrentModel).not.toHaveBeenCalled();
  });

  it("retains a saved cloud transcription default when its API key is removed", async () => {
    native.stt = "assemblyai-universal";
    vi.mocked(connector.getAssemblyaiApiKey).mockResolvedValueOnce("");
    await render(<Pickers />);
    await settle(() => expect(container.querySelector("[data-selection=\"assemblyai-universal\"]")).not.toBeNull());
    expect(container.querySelector("[data-selection=\"QuantizedLargeTurbo\"]")).toBeNull();
  });

  it("normalizes legacy transcription storage and falls back to native preference only when storage is empty", async () => {
    native.stt = "AssemblyAIUniversal";
    expect(await queryClient.fetchQuery(transcriptionModelQueryOptions())).toBe("assemblyai-universal");
    native.stt = "";
    expect(await queryClient.fetchQuery(transcriptionModelQueryOptions())).toBe("QuantizedBaseEn");
  });

  it("dismisses the download prompt when cloud transcription is selected through another control", async () => {
    native.noDownloadedModels = true;
    await render(<ModelDownloadNotification />);
    await settle(() => expect(toast).toHaveBeenCalled());
    await act(async () => {
      await getModelSelectionController(queryClient).selectTranscription("assemblyai-universal");
    });
    await settle(() => expect(sonnerToast.dismiss).toHaveBeenCalledWith("model-download-needed"));
  });

  it("recognizes configured custom mode without resolving or starting an LLM server", async () => {
    native.noDownloadedModels = true;
    native.stt = "assemblyai-universal";
    native.cloud = "";
    native.customEnabled = true;
    await render(<ModelDownloadNotification />);
    await settle(() => expect(sonnerToast.dismiss).toHaveBeenCalledWith("model-download-needed"));
    expect(toast).not.toHaveBeenCalled();
    expect(connector.getLlmConnection).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(modelSelectionKeys.customEndpointEnabled)).toBe(true);
    await act(async () => {
      await getModelSelectionController(queryClient).selectLocalChat("Gemma4E4b");
    });
    expect(queryClient.getQueryData(modelSelectionKeys.customEndpointEnabled)).toBe(false);
  });

  it("keeps the actual English model identity and still selects a different English model", async () => {
    native.stt = "QuantizedSmallEn";
    let model: ReturnType<typeof useSTTModel>;
    function LanguageSelector() {
      model = useSTTModel();
      return <output>{model.selectedLanguage}</output>;
    }
    await render(<LanguageSelector />);
    await settle(() => expect(container.textContent).toBe("QuantizedSmallEn"));
    await act(async () => {
      model.handleLanguageChange("english");
    });
    await settle(() => expect(native.stt).toBe("DistilLargeV35En"));
    expect(stt.setCurrentModel).toHaveBeenLastCalledWith("DistilLargeV35En");
  });

  it("maps a rejected unavailable selection to the existing translated download message", async () => {
    let model: ReturnType<typeof useSTTModel>;
    function LanguageSelector() {
      model = useSTTModel();
      return <output>{model.selectedLanguage}</output>;
    }
    await render(<LanguageSelector />);
    await settle(() => expect(queryClient.getQueryData(modelSelectionKeys.transcription)).toBe("QuantizedLargeTurbo"));
    vi.mocked(stt.isModelDownloaded).mockResolvedValueOnce(false);
    await act(async () => {
      model.handleLanguageChange("english");
    });
    await settle(() => expect(sonnerToast.error).toHaveBeenCalledWith("Download a model first", expect.any(Object)));
    expect(native.stt).toBe("QuantizedLargeTurbo");
  });

  it.each(["auto", "openai-gpt-4o"])("local chat replaces %s and updates both query observers", async (cloud) => {
    native.cloud = cloud;
    function ChatSelection() {
      const cloud = useCloudModelSelection();
      const local = useLocalModels();
      return <output>{cloud.selectedCloudModelId}:{String(local.models[0]?.isSelected)}</output>;
    }
    await render(<ChatSelection />);
    await settle(() => expect(container.textContent).toBe(`${cloud}:false`));
    await act(async () => {
      await getModelSelectionController(queryClient).selectLocalChat("Gemma4E4b");
    });
    await settle(() => expect(container.textContent).toBe(":true"));
    expect(connector.setCloudModel).toHaveBeenLastCalledWith("");
  });

  it.each(["chat", "transcription"] as const)(
    "routes %s download completion through selection and warms the server",
    async (type) => {
      if (type === "chat") {
        showLlmModelDownloadToast("Gemma4E4b", undefined, queryClient);
      } else {
        showSttModelDownloadToast("DistilLargeV35En", undefined, queryClient);
      }
      const call = vi.mocked(toast).mock.calls.at(-1)![0] as { content: ReactNode };
      await render(call.content);
      await settle(() => expect(type === "chat" ? llm.startServer : stt.startServer).toHaveBeenCalledOnce());
      if (type === "chat") {
        await settle(() => expect(native.cloud).toBe(""));
        expect(llm.setCurrentModel).toHaveBeenCalledOnce();
      } else {
        expect(native.stt).toBe("DistilLargeV35En");
        expect(stt.setCurrentModel).toHaveBeenCalledOnce();
      }
    },
  );

  it("preserves cloud selection when the local save fails and refreshes a partial transcription write", async () => {
    await queryClient.fetchQuery(cloudChatModelQueryOptions());
    await queryClient.fetchQuery(localChatModelQueryOptions());
    vi.mocked(llm.setCurrentModel).mockRejectedValueOnce(new Error("save failed"));
    const controller = getModelSelectionController(queryClient);
    await expect(controller.selectLocalChat("Gemma4E4b")).rejects.toThrow("save failed");
    expect(connector.setCloudModel).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(modelSelectionKeys.cloudChat)).toBe("auto");
    await queryClient.fetchQuery(transcriptionModelQueryOptions());
    native.runningStt = true;
    vi.mocked(stt.restartServer).mockRejectedValueOnce(new Error("restart failed"));
    await expect(controller.selectTranscription("DistilLargeV35En")).rejects.toThrow("restart failed");
    expect(queryClient.getQueryData(modelSelectionKeys.transcription)).toBe("DistilLargeV35En");
  });

  it("preserves cloud ownership when disabling legacy custom mode fails", async () => {
    await queryClient.fetchQuery(cloudChatModelQueryOptions());
    vi.mocked(connector.setCustomLlmEnabled).mockRejectedValueOnce(new Error("custom mode save failed"));
    await expect(getModelSelectionController(queryClient).selectLocalChat("Gemma4E4b"))
      .rejects.toThrow("custom mode save failed");
    expect(connector.setCloudModel).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(modelSelectionKeys.cloudChat)).toBe("auto");
  });

  it("cloud selection replaces the visible local selection through the same shared cache", async () => {
    native.cloud = "";
    await queryClient.fetchQuery(cloudChatModelQueryOptions());
    const controller = getModelSelectionController(queryClient);
    await controller.selectCloudChat("openai-gpt-4o");
    expect(queryClient.getQueryData(modelSelectionKeys.cloudChat)).toBe("openai-gpt-4o");
    await controller.selectCloudChat("auto");
    expect(queryClient.getQueryData(modelSelectionKeys.cloudChat)).toBe("auto");
  });

  it("keeps platform initialization policy centralized and preserves configured cloud choices", async () => {
    const controller = getModelSelectionController(queryClient);
    native.cloud = "";
    await controller.initializePlatformDefaults("macos");
    expect(connector.setCloudModel).not.toHaveBeenCalled();
    await controller.initializePlatformDefaults("windows");
    expect(native.cloud).toBe("auto");
    expect(native.stt).toBe("assemblyai-universal");
    native.cloud = "openai-gpt-4o";
    await controller.initializePlatformDefaults("windows");
    expect(native.cloud).toBe("openai-gpt-4o");
  });

  it.each([true, false])("retries initialization of the same failed chat model when running=%s", async running => {
    native.runningChat = running;
    queryClient.setQueryData(modelLifecycleKey("llm"), {
      Gemma4E4b: {
        id: "Gemma4E4b",
        isDownloaded: true,
        isDownloading: false,
        isLoading: false,
        isReady: false,
        progress: 0,
        lastUpdated: Date.now(),
        error: "runtime initialization failed",
      },
    });
    await getModelSelectionController(queryClient).selectLocalChat("Gemma4E4b");
    expect(native.chat).toBe("Gemma4E4b");
    expect(running ? llm.restartServer : llm.startServer).toHaveBeenCalledOnce();
    expect(running ? llm.startServer : llm.restartServer).not.toHaveBeenCalled();
    expect(native.cloud).toBe("");
  });

  it("restarts changed running models, without restarting for the same model", async () => {
    native.runningChat = true;
    native.runningStt = true;
    const controller = getModelSelectionController(queryClient);
    await controller.selectLocalChat("Phi4MiniQ4Km");
    await controller.selectLocalChat("Phi4MiniQ4Km");
    await controller.selectTranscription("DistilLargeV35En");
    await controller.selectTranscription("DistilLargeV35En");
    expect(llm.restartServer).toHaveBeenCalledOnce();
    expect(stt.restartServer).toHaveBeenCalledOnce();
  });

  it("serializes task default changes against the saved value instead of a stale component snapshot", async () => {
    const controller = getModelSelectionController(queryClient);
    await Promise.all([
      controller.setTaskDefault("project_brief_model_id", "auto"),
      controller.setTaskDefault("meeting_summary_model_id", "openai-gpt-4o"),
    ]);
    expect(native.defaults).toEqual({ project_brief_model_id: "auto", meeting_summary_model_id: "openai-gpt-4o" });
    await controller.setTaskDefault("project_brief_model_id", null);
    expect(native.defaults.meeting_summary_model_id).toBe("openai-gpt-4o");
  });

  it("refreshes shared queries on independent-window and native selection events and disposes listeners", async () => {
    function SelectionObserver() {
      useModelSelectionSync();
      const query = useQuery(transcriptionModelQueryOptions());
      return <output>{query.data}</output>;
    }
    await render(<SelectionObserver />);
    await settle(() => expect(container.textContent).toBe("QuantizedLargeTurbo"));
    for (const event of [MODEL_SELECTION_CHANGED_EVENT, "stt-model-selection-changed"]) {
      native.stt = event === MODEL_SELECTION_CHANGED_EVENT ? "DistilLargeV35En" : "assemblyai-universal";
      await act(async () => {
        native.listeners.get(event)?.forEach(listener => listener());
      });
      await settle(() => expect(container.textContent).toBe(native.stt));
    }
    await render(null);
    expect([...native.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
  });
  it("resynchronizes a selection changed during listener registration and disposes late listeners", async () => {
    const registrations: ((unlisten: () => void) => void)[] = [];
    vi.mocked(listen).mockImplementationOnce(() =>
      new Promise(resolve => {
        registrations.push(resolve);
      })
    );
    vi.mocked(listen).mockImplementationOnce(() =>
      new Promise(resolve => {
        registrations.push(resolve);
      })
    );
    function SelectionObserver() {
      useModelSelectionSync();
      const query = useQuery(transcriptionModelQueryOptions());
      return <output>{query.data}</output>;
    }
    await render(<SelectionObserver />);
    await settle(() => expect(container.textContent).toBe("QuantizedLargeTurbo"));
    native.stt = "DistilLargeV35En";
    const unlisten = vi.fn();
    await act(async () => {
      registrations.forEach(resolve => resolve(unlisten));
    });
    await settle(() => expect(container.textContent).toBe("DistilLargeV35En"));
    await render(null);
    expect(unlisten).toHaveBeenCalledTimes(2);

    registrations.length = 0;
    vi.mocked(listen).mockImplementationOnce(() =>
      new Promise(resolve => {
        registrations.push(resolve);
      })
    );
    vi.mocked(listen).mockImplementationOnce(() =>
      new Promise(resolve => {
        registrations.push(resolve);
      })
    );
    await render(<SelectionObserver />);
    await render(null);
    const lateUnlisten = vi.fn();
    await act(async () => {
      registrations.forEach(resolve => resolve(lateUnlisten));
    });
    expect(lateUnlisten).toHaveBeenCalledTimes(2);
  });
});
