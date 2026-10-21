// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LLMLocalView } from "@/components/settings/components/ai/llm-local-view";
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import {
  CLOUD_CATALOG_STALE_MS,
  type CloudProviderId,
  getCloudProviderSection,
  refreshCloudCatalogs,
  useCloudCatalogLabel,
  useCloudProviderModels,
} from "./cloud-model-catalog";
import { useAllModels } from "./useModels";

const state = vi.hoisted(() => ({
  selected: "",
  openaiKey: "test-openai-key",
  groqKey: "test-groq-key",
  openrouterKey: "",
}));
const native = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock(
  "./useCloudModelSelection",
  () => ({
    useCloudModelSelection: () => ({
      selectedCloudModelId: state.selected,
      isAutoMode: false,
      hasCloudSelection: !!state.selected,
    }),
  }),
);
vi.mock(
  "./useModelPreferences",
  () => ({ useModelPreferences: () => ({ selectCloudChat: native.save, selectLocalChat: native.save }) }),
);
vi.mock(
  "./useModelRegistry",
  () => ({ useModelRegistry: () => ({ selectableModels: [], models: [], isLoading: false, refetch: vi.fn() }) }),
);
vi.mock("@typr/plugin-connector", () => ({
  commands: {
    getOpenaiApiKey: async () => state.openaiKey,
    getGroqApiKey: async () => state.groqKey,
    getOpenrouterApiKey: async () => state.openrouterKey,
    setCloudModel: native.save,
  },
}));
vi.mock("@typr/plugin-local-llm", () => ({ commands: { getCurrentModel: async () => null } }));
vi.mock("@typr/plugin-local-stt", () => ({ commands: {} }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let result: ReturnType<typeof useCloudProviderModels>;
let all: ReturnType<typeof useAllModels>;
let label: ReturnType<typeof useCloudCatalogLabel>;
let fetchMock: ReturnType<typeof vi.fn>;
let models: { id: string; created?: number; active?: boolean; architecture?: { output_modalities: string[] } }[];

function Probe({ provider, combined = false }: { provider: CloudProviderId; combined?: boolean }) {
  result = useCloudProviderModels(provider);
  label = useCloudCatalogLabel();
  return combined ? <AllProbe /> : null;
}
function AllProbe() {
  all = useAllModels();
  return null;
}
async function waitForRendered(check: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    check();
  }, { timeout: 3000 });
}
async function waitForCatalog() {
  await waitForRendered(() => {
    expect(result.isLoading).toBe(false);
    expect(result.catalog.isFetching).toBe(false);
  });
}
async function render(provider: CloudProviderId = "openai", combined = false) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <Probe provider={provider} combined={combined} />
        </I18nProvider>
      </QueryClientProvider>,
    )
  );
  await waitForCatalog();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", webcrypto);
  notifyManager.setScheduler(callback => callback());
  i18n.load("en", english);
  i18n.load("es", spanish);
  i18n.activate("en");
  Object.assign(state, { selected: "", openaiKey: "test-openai-key", groqKey: "test-groq-key", openrouterKey: "" });
  native.save.mockClear();
  models = [{ id: "gpt-5.4", created: 20 }, { id: "gpt-6.1-sol", created: 40 }, { id: "gpt-6-astra", created: 30 }];
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: models }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live cloud model catalogue", () => {
  it("surfaces new OpenAI versions by provider creation date without a release allowlist", async () => {
    fetchMock.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
      return new Response(JSON.stringify({ data: models }), { status: 200 });
    });
    await render();
    expect(result.models.map(model => model.providerModelId)).toEqual(["gpt-6.1-sol", "gpt-6-astra", "gpt-5.4"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-openai-key" }) }),
    );
    expect(result.models[0].name).toBe("GPT-6.1 Sol");
    expect(native.save).not.toHaveBeenCalled();
  });
  it("pins the saved older model without overriding it on refresh", async () => {
    state.selected = "openai-gpt-5.4";
    await render();
    models.push({ id: "gpt-future", created: 100 });
    await act(async () => {
      await result.refetch();
    });
    expect(result.models.map(model => model.providerModelId)).toEqual([
      "gpt-5.4",
      "gpt-future",
      "gpt-6.1-sol",
      "gpt-6-astra",
    ]);
    expect(result.models[0].isSelected).toBe(true);
    expect(native.save).not.toHaveBeenCalled();
  });
  it("keeps a saved choice visible when omitted from a refreshed catalogue", async () => {
    state.selected = "openai-saved-model";
    await render();
    expect(result.models[0]).toMatchObject({ id: state.selected, source: "manual", isSelected: true });
    expect(native.save).not.toHaveBeenCalled();
  });
  it("asks OpenRouter for weekly popularity and preserves its order", async () => {
    models = [{ id: "z-ai/popular", created: 1 }, { id: "anthropic/newer", created: 100 }, {
      id: "openai/third",
      created: 50,
    }];
    await render("openrouter");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models?sort=top-weekly&output_modalities=text",
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
    expect(result.models.map(model => model.providerModelId)).toEqual(models.map(model => model.id));
  });
  it("preserves catalogue order through the combined-model hook used by Chat", async () => {
    await render("openai", true);
    expect(all.allModels.filter(model => model.id.startsWith("openai-")).map(model => model.providerModelId)).toEqual([
      "gpt-6.1-sol",
      "gpt-6-astra",
      "gpt-5.4",
    ]);
  });
  it("filters unsupported media, batch, legacy-completion and inactive models", async () => {
    models.push(
      ...[
        "gpt-image",
        "gpt-audio",
        "gpt-tts",
        "text-embedding",
        "sora-2",
        "gpt-codex",
        "gpt-deep-research",
        "gpt-3.5-turbo-instruct",
        "gpt:batch",
        "gpt-5-pro",
        "gpt-5.2-pro-2026-01-01",
        "o3-pro",
        "o1-pro-2025-03-19",
      ].map(id => ({ id, created: 100 })),
      { id: "gpt-inactive", active: false, created: 100 },
    );
    await render();
    expect(result.models).toHaveLength(3);
  });
  it("uses modality metadata to exclude OpenRouter image generation", async () => {
    models = [{ id: "some/text", architecture: { output_modalities: ["text"] } }, {
      id: "some/multimodal",
      architecture: { output_modalities: ["text", "image"] },
    }];
    await render("openrouter");
    expect(result.models.map(model => model.providerModelId)).toEqual(["some/text"]);
  });
  it("does not offer invented recommendations or request OpenAI without a key", async () => {
    state.openaiKey = "";
    await render();
    expect(result.models).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retains the last successful catalogue when refresh fails", async () => {
    await render();
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await act(async () => {
      await result.refetch();
    });
    expect(result.models.map(model => model.providerModelId)).toEqual(["gpt-6.1-sol", "gpt-6-astra", "gpt-5.4"]);
    expect(result.catalog.isError).toBe(true);
  });
  it("rejects malformed provider data while preserving a successful catalogue", async () => {
    await render();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: "bad" }), { status: 200 }));
    await act(async () => {
      await result.refetch();
    });
    expect(result.models).toHaveLength(3);
  });
  it("scopes catalogue caches to the configured key without exposing keys in query identifiers", async () => {
    await render();
    state.openaiKey = "test-different-account";
    models = [{ id: "gpt-account-two", created: 100 }];
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["cloud-api-keys"] });
    });
    await waitForCatalog();
    expect(result.models.map(model => model.providerModelId)).toEqual(["gpt-account-two"]);
    const identifiers = JSON.stringify(client.getQueryCache().getAll().map(query => query.queryKey));
    expect(identifiers).not.toContain("test-openai-key");
    expect(identifiers).not.toContain("test-different-account");
  });
  it("refreshes a stale catalogue when the picker opens, and reuses a fresh one", async () => {
    await render();
    await act(async () => {
      await refreshCloudCatalogs(client);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + CLOUD_CATALOG_STALE_MS + 1);
    models.push({ id: "gpt-newly-released", created: 200 });
    await act(async () => {
      await refreshCloudCatalogs(client);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.models[0].providerModelId).toBe("gpt-newly-released");
    vi.restoreAllMocks();
  });
  it.each(["en", "es"])("labels provider ordering in %s", async locale => {
    i18n.activate(locale);
    await render();
    expect(label("openai")).toBe(locale === "es" ? "Más recientes disponibles" : "Newest available");
    expect(label("openrouter")).toBe(
      locale === "es" ? "Populares esta semana en OpenRouter" : "Popular this week on OpenRouter",
    );
  });
  it("gives both pickers the saved choice plus five live entries and the full searchable list", async () => {
    models = Array.from({ length: 145 }, (_, index) => ({ id: `gpt-entry-${index}`, created: index }));
    state.selected = "openai-gpt-entry-0";
    await render();
    const preview = getCloudProviderSection(result.models, "openai", false);
    expect(preview.models.map(model => model.providerModelId)).toEqual([
      "gpt-entry-0",
      "gpt-entry-144",
      "gpt-entry-143",
      "gpt-entry-142",
      "gpt-entry-141",
      "gpt-entry-140",
    ]);
    const expanded = getCloudProviderSection(result.models, "openai", true);
    expect(expanded.models).toHaveLength(145);
    expect(expanded.models.at(-1)?.providerModelId).toBe("gpt-entry-1");
    expect(
      getCloudProviderSection(result.models, "openai", true, "entry-1").models.some(model =>
        model.providerModelId === "gpt-entry-1"
      ),
    ).toBe(true);
  });
  it("keeps OpenRouter Pro and Codex chat routes while excluding direct Responses-only families", async () => {
    models = [{ id: "google/gemini-pro" }, { id: "openai/gpt-5-pro" }, { id: "openai/gpt-codex" }];
    await render("openrouter");
    expect(result.models.map(model => model.providerModelId)).toEqual(models.map(model => model.id));
  });
  it("refreshes mounted catalogues periodically", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    await render();
    models.push({ id: "gpt-later", created: 200 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOUD_CATALOG_STALE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.models[0].providerModelId).toBe("gpt-later");
  });
  it("lets Settings recover an initial catalogue failure without re-entering the API key", async () => {
    let failing = true;
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("api.openai.com")
        ? new Response(JSON.stringify({ data: models }), { status: failing ? 503 : 200 })
        : new Response(JSON.stringify({ data: [] }), { status: 200 })
    );
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nProvider i18n={i18n}>
            <LLMLocalView
              supportsLocalModels={false}
              handleModelDownload={async () => {}}
              handleShowFileLocation={async () => {}}
            />
          </I18nProvider>
        </QueryClientProvider>,
      )
    );
    await waitForRendered(() => expect(host.textContent).toContain("Could not load models. Try again."));
    expect(host.textContent).not.toContain("GPT-6.1 Sol");
    const keyInput = host.querySelector<HTMLInputElement>("input[placeholder=\"sk-...\"]");
    expect(keyInput?.value).toBe("test-openai-key");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button =>
      button.textContent === "Retry"
    );
    expect(retry).not.toBeUndefined();
    failing = false;
    await act(async () => retry!.click());
    await waitForRendered(() => expect(host.textContent).toContain("GPT-6.1 Sol"));
    expect(host.textContent).not.toContain("Could not load models. Try again.");
    expect(keyInput?.value).toBe("test-openai-key");
  });
});
