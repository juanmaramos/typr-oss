import { describe, expect, it, vi } from "vitest";
vi.mock("@typr/plugin-local-stt", () => ({ commands: {} }));
import { getAvailableLanguageOptions } from "@/components/transcript/constants/languageData";
import { getAvailableSettingsSttModels } from "./stt-capabilities";

describe("native STT capabilities", () => {
  it("keeps an unconfigured prototype out of every model picker", () => {
    expect(getAvailableSettingsSttModels(undefined)).not.toContain("Nemotron3p5Streaming");
    expect(
      getAvailableSettingsSttModels([{
        model: "Nemotron3p5Streaming",
        backend: "NemotronStreaming",
        size_bytes: 741548352,
        realtime: true,
        recorded: false,
        available: false,
      }]),
    ).toEqual([]);
    expect(getAvailableLanguageOptions(true).map(model => model.key)).not.toContain("nemotron-streaming");
  });
  it("offers the configured native streaming model while preserving Whisper and platform availability", () => {
    const available = getAvailableSettingsSttModels([
      {
        model: "Nemotron3p5Streaming",
        backend: "NemotronStreaming",
        size_bytes: 741548352,
        realtime: true,
        recorded: false,
        available: true,
      },
      {
        model: "QuantizedLargeTurbo",
        backend: "Whisper",
        size_bytes: 574000000,
        realtime: false,
        recorded: true,
        available: true,
      },
    ]);
    expect(available).toEqual(["Nemotron3p5Streaming", "QuantizedLargeTurbo"]);
    expect(getAvailableLanguageOptions(true, available).map(model => model.key)).toContain("nemotron-streaming");
    expect(getAvailableLanguageOptions(false, available).map(model => model.key)).not.toContain("nemotron-streaming");
  });
});
