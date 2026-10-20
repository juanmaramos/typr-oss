import type { ModelCapabilities } from "@typr/plugin-local-stt";
import { describe, expect, it } from "vitest";
import { cloudModelAvailability, localModelAvailability, transcriptionModelAvailability } from "./model-availability";
import type { ModelInfo } from "./model-lifecycle";

const read = { isPending: false, isError: false };
const model = (id: string, downloaded = true): ModelInfo => ({
  id,
  isDownloaded: downloaded,
  isDownloading: false,
  isLoading: false,
  isReady: false,
  progress: 0,
  lastUpdated: 1,
});
const whisper: ModelCapabilities = {
  model: "QuantizedLargeTurbo",
  backend: "Whisper",
  size_bytes: 1,
  available: true,
  recorded: true,
  realtime: false,
  supported_languages: null,
  supported_locales: null,
  live_fallback_models: [],
  recorded_fallback_models: ["QuantizedLargeTurbo"],
};
const nemo: ModelCapabilities = {
  ...whisper,
  model: "Nemotron3p5Streaming",
  backend: "NemotronStreaming",
  recorded: false,
  realtime: true,
  live_fallback_models: ["QuantizedLargeTurbo"],
};
const base = () => ({
  id: "Nemotron3p5Streaming",
  mode: "live" as "live" | "recorded",
  lifecycle: read,
  models: {
    Nemotron3p5Streaming: model("Nemotron3p5Streaming"),
    QuantizedLargeTurbo: model("QuantizedLargeTurbo", false),
  },
  capabilities: { ...read, data: [whisper, nemo] },
  credentials: { ...read, hasKey: false },
});
describe("central model availability", () => {
  it("distinguishes pending and failed checks from a known absent artifact", () => {
    expect(localModelAvailability({ ...read, isPending: true }, undefined).status).toBe("checking");
    expect(localModelAvailability({ ...read, isError: true }, undefined).status).toBe("error");
    expect(localModelAvailability(read, model("selected", false)).status).toBe("needs-download");
    expect(localModelAvailability(read, undefined).status).toBe("unavailable");
  });
  it("permits configuration throughout checks and blocks starting during a download or load", () => {
    for (
      const availability of [
        localModelAvailability({ ...read, isPending: true }, undefined),
        localModelAvailability(read, { ...model("selected"), isDownloading: true, progress: 42 }),
        localModelAvailability(read, { ...model("selected"), isLoading: true }),
      ]
    ) {
      expect(availability.canConfigure).toBe(true);
      expect(availability.canStart).toBe(false);
      expect(availability.canDownload).toBe(false);
    }
  });
  it("allows retrying a failed download without claiming a downloaded artifact", () => {
    const result = localModelAvailability(read, { ...model("selected", false), error: "interrupted" });
    expect(result).toMatchObject({ status: "error", canRetry: true, canDownload: true, canStart: false });
  });
  it("requires the cloud key and never maps a failed key read to a missing key", () => {
    expect(cloudModelAvailability(read, false)).toMatchObject({ status: "needs-api-key", canStart: false });
    expect(cloudModelAvailability({ ...read, isError: true }, false).status).toBe("error");
    expect(cloudModelAvailability(read, true).canStart).toBe(true);
    const input = base();
    input.id = "assemblyai-universal";
    expect(transcriptionModelAvailability(input).canStart).toBe(false);
    input.credentials.hasKey = true;
    expect(transcriptionModelAvailability(input).canStart).toBe(true);
  });
  it("does not use unrelated downloaded artifacts to unlock live Whisper", () => {
    const input = base();
    input.id = "QuantizedLargeTurbo";
    expect(transcriptionModelAvailability(input)).toMatchObject({ status: "needs-download", canStart: false });
  });
  it("requires an advertised Whisper fallback for recorded Nemotron", () => {
    const input = base();
    input.mode = "recorded";
    expect(transcriptionModelAvailability(input)).toMatchObject({
      status: "unavailable",
      reason: "recorded-fallback-required",
      canStart: false,
    });
    input.models.QuantizedLargeTurbo.isDownloaded = true;
    expect(transcriptionModelAvailability(input)).toMatchObject({
      status: "ready",
      reason: "native-fallback",
      canStart: true,
    });
  });
  it("retains download recovery when missing Nemotron can fall back for live use", () => {
    const input = base();
    input.models.Nemotron3p5Streaming.isDownloaded = false;
    input.models.QuantizedLargeTurbo.isDownloaded = true;
    expect(transcriptionModelAvailability(input)).toMatchObject({
      reason: "native-fallback",
      canStart: true,
      canSelect: false,
      canDownload: true,
    });
  });
  it("uses capability metadata instead of a copied fallback list", () => {
    const input = base();
    input.mode = "recorded";
    input.models.QuantizedLargeTurbo.isDownloaded = true;
    input.capabilities.data = [{ ...nemo, recorded_fallback_models: [] }];
    expect(transcriptionModelAvailability(input).canStart).toBe(false);
  });
  it("keeps native initialization failures recoverable for downloaded models", () => {
    expect(localModelAvailability(read, { ...model("selected"), error: "initialization failed" }))
      .toMatchObject({ status: "error", canSelect: true, canStart: true, canRetry: true });
  });
});
