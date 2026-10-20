// @vitest-environment jsdom
import type { ModelInfo } from "@/lib/model-lifecycle";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAIAvailability } from "./useAIAvailability";

const native = vi.hoisted(() => ({
  local: "selected",
  cloud: "",
  custom: false,
  endpoint: "",
  model: "",
  key: "",
  keyError: false,
}));
const platform = vi.hoisted(() => ({ supportsLocalModels: true, isLoading: false, isError: false, refetch: vi.fn() }));
vi.mock("./usePlatform", () => ({ usePlatform: () => platform }));
const lifecycle = vi.hoisted(() => ({ isPending: false, isError: false, models: [] as ModelInfo[], refetch: vi.fn() }));
vi.mock("./useModelState", () => ({
  useModelLifecycle: () => ({
    ...lifecycle,
    getModel: (id: string) => lifecycle.models.find(model => model.id === id),
  }),
}));
vi.mock("./cloud-model-catalog", () => ({
  useCloudApiKeys: () => ({
    data: { openai: native.key },
    isPending: false,
    isError: native.keyError,
    refetch: vi.fn(),
  }),
  getCloudProviderIdFromModelId: (id: string) => id.startsWith("openai-") ? "openai" : null,
  hasCloudApiKey: (keys: { openai?: string }) => !!keys?.openai,
  hasAnyCloudApiKey: (keys: { openai?: string }) => !!keys?.openai,
}));
vi.mock("@typr/plugin-connector", () => ({
  commands: {
    getCloudModel: async () => native.cloud,
    getCustomLlmEnabled: async () => native.custom,
    getCustomLlmConnection: async () => ({ api_base: native.endpoint, api_key: null }),
    getCustomLlmModel: async () => native.model,
  },
}));
vi.mock("@typr/plugin-local-llm", () => ({ commands: { getCurrentModel: async () => native.local } }));
vi.mock("@typr/plugin-local-stt", () => ({ commands: {} }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let result: ReturnType<typeof useAIAvailability>;
function Probe() {
  result = useAIAvailability();
  return null;
}
async function render() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
const artifact = (id: string, downloaded: boolean): ModelInfo => ({
  id,
  isDownloaded: downloaded,
  isDownloading: false,
  isLoading: false,
  isReady: false,
  progress: 0,
  lastUpdated: 1,
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(callback => callback());
  Object.assign(native, {
    local: "selected",
    cloud: "",
    custom: false,
    endpoint: "",
    model: "",
    key: "",
    keyError: false,
  });
  platform.supportsLocalModels = true;
  platform.isLoading = false;
  platform.isError = false;
  lifecycle.isPending = false;
  lifecycle.isError = false;
  lifecycle.models = [artifact("selected", false), artifact("unrelated", true)];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});
describe("Chat routing availability", () => {
  it("does not enable a missing selected model because an unrelated model was downloaded", async () => {
    await render();
    expect(result.availability).toMatchObject({ status: "needs-download", canStart: false });
  });
  it("does not silently fall back from a selected cloud model with a missing key", async () => {
    native.cloud = "openai-gpt-test";
    lifecycle.models[0].isDownloaded = true;
    await render();
    expect(result.availability).toMatchObject({ status: "needs-api-key", canStart: false });
  });
  it("allows Auto to use the selected local model when no cloud provider is configured", async () => {
    native.cloud = "auto";
    lifecycle.models[0].isDownloaded = true;
    await render();
    expect(result.availability.canStart).toBe(true);
  });
  it("permits a configured cloud selection despite an unrelated local cache failure", async () => {
    native.cloud = "openai-gpt-test";
    native.key = "configured";
    lifecycle.isError = true;
    await render();
    expect(result.availability.canStart).toBe(true);
  });
  it("preserves failed key reads as errors rather than no-key setup", async () => {
    native.cloud = "auto";
    native.keyError = true;
    await render();
    expect(result.availability.status).toBe("error");
  });
  it("requires cloud setup when local models are unsupported", async () => {
    platform.supportsLocalModels = false;
    native.cloud = "auto";
    await render();
    expect(result.availability.status).toBe("needs-api-key");
  });
  it("requires a configured custom endpoint when custom mode has routing precedence", async () => {
    native.custom = true;
    lifecycle.models[0].isDownloaded = true;
    await render();
    expect(result.availability.canStart).toBe(false);
    native.endpoint = "http://localhost:9000";
    native.model = "configured";
    await act(async () => {
      await client.invalidateQueries();
    });
    expect(result.availability.canStart).toBe(true);
  });
});
