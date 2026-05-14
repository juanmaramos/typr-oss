import { describe, expect, it } from "vitest";
import {
  AUTO_CLOUD_MODEL_ID,
  normalizeStoredCloudModelId,
  resolveCloudModelId,
} from "./cloud-models";

describe("cloud model resolution", () => {
  it("keeps Windows on Auto instead of forcing a provider default", () => {
    expect(normalizeStoredCloudModelId("", "windows")).toBe(AUTO_CLOUD_MODEL_ID);
    expect(resolveCloudModelId("", "windows")).toBe("");
  });

  it("does not resolve Auto to a cloud provider without runtime API key checks", () => {
    expect(resolveCloudModelId(AUTO_CLOUD_MODEL_ID, "macos")).toBe("");
  });

  it("preserves explicit cloud model selections", () => {
    expect(resolveCloudModelId("openai-gpt-5.4-mini", "macos")).toBe("openai-gpt-5.4-mini");
  });
});
