import { restoreOnboardingModelSetup } from "@/components/welcome-modal/model-setup";
import { QueryClient } from "@tanstack/react-query";
import { commands, type ModelCapabilities } from "@typr/plugin-local-stt";
import { beforeEach, expect, it, vi } from "vitest";
import {
  downloadTranscriptionSetup,
  transcriptionSetupModels,
  transcriptionSetupSizeBytes,
  transcriptionSetupState,
} from "./stt-setup";

vi.mock("@typr/plugin-local-stt", () => ({
  commands: {
    listModelCapabilities: vi.fn(),
    isModelDownloaded: vi.fn(),
    isModelDownloading: vi.fn(),
    downloadModelBackground: vi.fn(),
  },
}));
const capabilities: ModelCapabilities[] = [
  {
    model: "Nemotron3p5Streaming",
    backend: "NemotronStreaming",
    size_bytes: 741548352,
    realtime: true,
    recorded: false,
    available: true,
    supported_languages: null,
    supported_locales: null,
    live_fallback_models: ["QuantizedLargeTurbo", "QuantizedSmall"],
    recorded_fallback_models: ["QuantizedLargeTurbo"],
  },
  {
    model: "QuantizedLargeTurbo",
    backend: "Whisper",
    size_bytes: 574000000,
    realtime: false,
    recorded: true,
    available: true,
    supported_languages: null,
    supported_locales: null,
    live_fallback_models: [],
    recorded_fallback_models: [],
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(commands.listModelCapabilities).mockResolvedValue(capabilities);
  vi.mocked(commands.isModelDownloaded).mockResolvedValue(false);
  vi.mocked(commands.isModelDownloading).mockResolvedValue(false);
});
it("prepares the advertised recovery model once without changing the selected model", async () => {
  expect(transcriptionSetupModels("Nemotron3p5Streaming", capabilities)).toEqual([
    "Nemotron3p5Streaming",
    "QuantizedLargeTurbo",
  ]);
  expect(transcriptionSetupModels("QuantizedLargeTurbo", capabilities)).toEqual(["QuantizedLargeTurbo"]);
  await downloadTranscriptionSetup(new QueryClient(), "Nemotron3p5Streaming");
  expect(vi.mocked(commands.downloadModelBackground).mock.calls).toEqual([["Nemotron3p5Streaming"], [
    "QuantizedLargeTurbo",
  ]]);
});
it("resumes without restarting downloaded or running downloads", async () => {
  vi.mocked(commands.isModelDownloaded).mockImplementation(async model => model === "Nemotron3p5Streaming");
  vi.mocked(commands.isModelDownloading).mockImplementation(async model => model === "QuantizedLargeTurbo");
  await downloadTranscriptionSetup(new QueryClient(), "Nemotron3p5Streaming");
  expect(commands.downloadModelBackground).not.toHaveBeenCalled();
});
it("does not offer a setup as complete until its fallback is also downloaded", () => {
  const record = (downloaded: boolean, progress = 0, error?: string) => ({
    id: "",
    isDownloaded: downloaded,
    progress,
    error,
    isDownloading: false,
    isLoading: false,
    isReady: false,
    lastUpdated: 0,
  });
  const states = { Nemotron3p5Streaming: record(true), QuantizedLargeTurbo: record(false, 50) };
  expect(transcriptionSetupState("Nemotron3p5Streaming", capabilities, states)).toMatchObject({
    completed: false,
    progress: 75,
    sizeBytes: 1315548352,
  });
  states.QuantizedLargeTurbo = record(false, 0, "offline");
  expect(transcriptionSetupState("Nemotron3p5Streaming", capabilities, states).error).toBe("offline");
  states.QuantizedLargeTurbo = record(true);
  expect(transcriptionSetupState("Nemotron3p5Streaming", capabilities, states).completed).toBe(true);
  expect(transcriptionSetupState("Nemotron3p5Streaming", undefined, states).completed).toBe(false);
});
it("rejects unavailable runtimes before starting any download", async () => {
  vi.mocked(commands.listModelCapabilities).mockResolvedValue([{ ...capabilities[0], available: false }]);
  await expect(downloadTranscriptionSetup(new QueryClient(), "Nemotron3p5Streaming")).rejects.toThrow(
    "stt_model_unavailable",
  );
  expect(commands.downloadModelBackground).not.toHaveBeenCalled();
});
it("restores an in-progress streaming setup and preserves explicit Whisper choices", () => {
  expect(restoreOnboardingModelSetup(null, "Nemotron3p5Streaming").sttModel).toBe("Nemotron3p5Streaming");
  expect(restoreOnboardingModelSetup({ stt_model: "Nemotron3p5Streaming" }).sttModel).toBe("Nemotron3p5Streaming");
  expect(restoreOnboardingModelSetup({ stt_model: "QuantizedSmall" }, "Nemotron3p5Streaming").sttModel).toBe(
    "QuantizedSmall",
  );
});

it("includes the advertised recovery model in download button sizes", () => {
  expect(transcriptionSetupSizeBytes("Nemotron3p5Streaming", capabilities)).toBe(1315548352);
  expect(transcriptionSetupSizeBytes("QuantizedLargeTurbo", capabilities)).toBe(574000000);
});
