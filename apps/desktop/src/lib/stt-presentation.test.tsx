// @vitest-environment jsdom
import { STTLanguageSelector } from "@/components/transcript/actions/STTLanguageSelector";
import {
  getSttModelDescription,
  getSttModelLabel,
  getSttModelMetadata,
  getSttSupportedLanguages,
  LANGUAGE_OPTIONS,
  type LanguageOption,
  SETTINGS_LOCAL_STT_MODEL_KEYS,
} from "@/components/transcript/constants/languageData";
import { STTProviderIcon } from "@/components/transcript/STTProviderIcon";
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ModelCapabilities } from "@typr/plugin-local-stt";
import { TooltipProvider } from "@typr/ui/components/ui/tooltip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ supportsLocalModels: true }));
const downloadState = vi.hoisted(() => ({ isDownloaded: true, isDownloading: false }));
const downloadModel = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePlatform", () => ({ usePlatform: () => platform }));
vi.mock(
  "@/components/transcript/hooks/useModelDownload",
  () => ({
    useModelDownload: () => ({
      getModelStatus: () => downloadState,
      downloadModel,
    }),
  }),
);
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const languages = ["en", "es", "no"];
const native: ModelCapabilities = {
  model: "Nemotron3p5Streaming",
  backend: "NemotronStreaming",
  size_bytes: 741548352,
  realtime: true,
  recorded: false,
  available: true,
  supported_languages: languages,
  supported_locales: ["en-US", "es-ES"],
};
async function render(node: React.ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <TooltipProvider>{node}</TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>,
    )
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  platform.supportsLocalModels = true;
  downloadState.isDownloaded = true;
  downloadState.isDownloading = false;
  downloadModel.mockClear();
  i18n.load("en", english);
  i18n.load("es", spanish);
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["stt-model-capabilities"], [native]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("canonical STT presentation", () => {
  it("keeps every selectable native model's true identity rather than substituting a generic size or language", () => {
    const expected = {
      Nemotron3p5Streaming: ["Nemotron 3.5", "NVIDIA"],
      QuantizedTiny: ["Whisper Tiny", "OpenAI"],
      QuantizedTinyEn: ["Whisper Tiny (English)", "OpenAI"],
      QuantizedBase: ["Whisper Base", "OpenAI"],
      QuantizedBaseEn: ["Whisper Base (English)", "OpenAI"],
      QuantizedSmall: ["Whisper Small", "OpenAI"],
      QuantizedSmallEn: ["Whisper Small (English)", "OpenAI"],
      QuantizedLargeTurbo: ["Whisper Large v3 Turbo", "OpenAI"],
      DistilLargeV35En: ["Distil-Whisper Large v3.5 (English)", "Distil-Whisper"],
    };
    for (const id of SETTINGS_LOCAL_STT_MODEL_KEYS) {
      expect([getSttModelLabel(id), getSttModelMetadata(id)?.provider]).toEqual(expected[id]);
      const option = LANGUAGE_OPTIONS.find(option => option.modelKey === id)!;
      expect(getSttModelLabel(option.key)).toBe(expected[id][0]);
      expect(option.label).toBe(expected[id][0]);
      expect(getSttModelDescription(id, [native])).not.toMatch(/\b(?:Typr|highest|best accuracy|any language)\b/i);
    }
    expect(getSttModelLabel("AssemblyAIUniversal")).toBe("Universal Streaming Multilingual");
    expect(getSttModelLabel("unknown-native-id")).toBe("Transcription model");
  });

  it("derives native language count from usable language capabilities and keeps cloud support at six", async () => {
    expect(getSttModelDescription("Nemotron3p5Streaming", [native])).toContain("3 languages");
    expect(getSttSupportedLanguages("nemotron-streaming", [native])).toEqual(languages);
    expect(getSttSupportedLanguages("assemblyai-universal")).toEqual(["en", "es", "fr", "de", "it", "pt"]);
    expect(getSttModelDescription("AssemblyAIUniversal")).toContain("6 languages");
    expect(
      getSttSupportedLanguages("QuantizedBase", [{
        ...native,
        model: "QuantizedBase",
        backend: "Whisper",
        supported_languages: null,
      }]),
    ).toBeNull();
    await act(async () => i18n.activate("es"));
    expect(getSttModelDescription("Nemotron3p5Streaming", [native])).toContain("3 idiomas");
    expect(getSttModelLabel("QuantizedBaseEn")).toBe("Whisper Base (inglés)");
  });

  it("renders verified provider marks consistently and leaves location to separate badges", async () => {
    await render(
      <>
        {["Nemotron3p5Streaming", "QuantizedBase", "DistilLargeV35En", "AssemblyAIUniversal"].map(id => (
          <STTProviderIcon key={id} model={id} />
        ))}
      </>,
    );
    const makers = [...container.querySelectorAll("[data-stt-provider]")];
    expect(makers.map(node => node.getAttribute("data-stt-provider"))).toEqual([
      "NVIDIA",
      "OpenAI",
      "Distil-Whisper",
      "AssemblyAI",
    ]);
    expect(makers.every(node => node.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(makers[0].querySelector("svg path")?.getAttribute("fill")).toBe("currentColor");
    expect(makers[1].querySelector("svg path")).not.toBeNull();
    expect(makers[1].querySelector("i")).toBeNull();
    expect(makers[2].querySelector("img")?.getAttribute("src")).toBe("/icons/huggingface-mono.svg");
    expect([...makers[3].querySelectorAll("img")].map(node => node.getAttribute("src"))).toEqual([
      "/icons/assemblyai-mono.svg",
    ]);
  });

  it("preserves a saved local model identity when only the cloud choice is available", async () => {
    platform.supportsLocalModels = false;
    const onChange = vi.fn();
    await render(<STTLanguageSelector value="QuantizedBase" onChange={onChange} size="compact" />);
    const trigger = container.querySelector("button")!;
    expect(trigger.textContent).toContain("Whisper Base");
    await act(async () => trigger.click());
    const cloud = [...document.body.querySelectorAll("button")].find(button =>
      button.textContent?.includes("Universal Streaming Multilingual")
    )!;
    expect(cloud).toBeTruthy();
    await act(async () => cloud.click());
    expect(onChange).toHaveBeenCalledWith("assemblyai-universal");
  });

  it("keeps the icon-only picker visible and openable with no recognized selection or downloaded model", async () => {
    downloadState.isDownloaded = false;
    const onChange = vi.fn();
    await render(<STTLanguageSelector value={"" as LanguageOption} onChange={onChange} isActive />);
    const trigger = container.querySelector("button")!;
    expect(trigger.disabled).toBe(false);
    expect(trigger.textContent).toContain("Select model");
    expect(trigger.querySelector("svg path")).not.toBeNull();
    await act(async () => trigger.click());
    const base = [...document.body.querySelectorAll("button")].find(button =>
      button.textContent?.includes("Whisper Base")
    )!;
    expect(base.textContent).toContain("Not downloaded");
    await act(async () => base.click());
    expect(onChange).not.toHaveBeenCalled();
    const download = base.querySelector("[class*=cursor-pointer]") as HTMLElement;
    await act(async () => download.click());
    expect(downloadModel).toHaveBeenCalledWith("QuantizedBase");
  });

  it("preserves the model icon when switching models is disabled during recording", async () => {
    const onChange = vi.fn();
    await render(<STTLanguageSelector value="balanced" onChange={onChange} isActive disabled />);
    const trigger = container.querySelector("button")!;
    expect(trigger.disabled).toBe(true);
    expect(trigger.querySelector("[data-stt-provider]")?.getAttribute("data-stt-provider")).toBe("OpenAI");
    await act(async () => trigger.click());
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
  });

  it.each(["QuantizedBase", "QuantizedSmall", "balanced", "nemotron-streaming"] as const)(
    "shows the actual saved model in the live picker for %s",
    async value => {
      await render(<STTLanguageSelector value={value} onChange={vi.fn()} size="compact" />);
      const button = container.querySelector("button")!;
      expect(button.textContent).toContain(getSttModelLabel(value));
      expect(button.querySelector("[data-stt-provider]")?.getAttribute("data-stt-provider")).toBe(
        getSttModelMetadata(value)?.provider,
      );
      await act(async () => i18n.activate("es"));
      expect(button.textContent).toContain(getSttModelLabel(value));
    },
  );
});
