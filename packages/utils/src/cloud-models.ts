export const AUTO_CLOUD_MODEL_ID = "auto";
export const AUTO_CLOUD_MODEL_PRIORITY = [
  "openrouter-openai/gpt-5.4-mini",
  "openrouter-anthropic/claude-haiku-4.5",
  "openrouter-google/gemini-3.1-flash-lite",
  "openai-gpt-5.4-mini",
  "groq-openai/gpt-oss-20b",
] as const;
export const DEFAULT_AUTO_CLOUD_MODEL_ID = AUTO_CLOUD_MODEL_PRIORITY[0];
export const WINDOWS_DEFAULT_CLOUD_MODEL_ID = DEFAULT_AUTO_CLOUD_MODEL_ID;
export const LEGACY_WINDOWS_DEFAULT_CLOUD_MODEL_ID = "openrouter-google/gemma-4-26b-a4b-it";

export function isWindowsOsType(osType: string | null | undefined): boolean {
  return osType === "windows";
}

export function getOsTypeSafe(): string | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const userAgent = navigator.userAgent?.toLowerCase() ?? "";
  const platform = navigator.platform?.toLowerCase() ?? "";
  const source = `${platform} ${userAgent}`;

  if (source.includes("win")) {
    return "windows";
  }

  if (source.includes("mac")) {
    return "macos";
  }

  if (source.includes("linux")) {
    return "linux";
  }

  return null;
}

export function normalizeStoredCloudModelId(cloudModelId: string | null | undefined, osType?: string | null): string {
  const normalized = cloudModelId?.trim() ?? "";
  if (normalized.length > 0) {
    return normalized;
  }

  return isWindowsOsType(osType) ? AUTO_CLOUD_MODEL_ID : "";
}

export function resolveCloudModelId(cloudModelId: string | null | undefined, osType?: string | null): string {
  const normalized = normalizeStoredCloudModelId(cloudModelId, osType);
  if (normalized === AUTO_CLOUD_MODEL_ID) {
    return "";
  }

  return normalized;
}

export async function resolveCloudModelIdForCurrentOs(cloudModelId: string | null | undefined): Promise<string> {
  return resolveCloudModelId(cloudModelId, getOsTypeSafe());
}
