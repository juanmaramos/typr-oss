import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { SupportedModel } from "@typr/plugin-local-llm";

// Native metadata remains canonical; app-owned explanatory copy is localized at display time.
const localChatDescriptions = {
  Llama3p2_3bQ4: msg`Fast and reliable for simple tasks`,
  Phi4MiniQ4Km: msg`Best for meeting Q&A and chat`,
  Gemma3_4b: msg`Good for writing and conversation`,
  Gemma4E4b: msg`Smarter responses for complex questions and long meetings`,
  Qwen3_4bThinkingQ4Km: msg`Reasoning-focused model for complex questions`,
} satisfies Record<SupportedModel, { id: string }>;

export function getLocalChatModelDescription(model: SupportedModel): string {
  return i18n._(localChatDescriptions[model]);
}

/** Decimal download units match the native model byte counts. */
export function formatModelSize(bytes: number): string {
  const gigabytes = bytes >= 1_000_000_000;
  const value = gigabytes ? bytes / 1_000_000_000 : bytes / 1_000_000;
  const size = new Intl.NumberFormat(i18n.locale || "en", {
    maximumFractionDigits: gigabytes ? 1 : 0,
    useGrouping: false,
  }).format(value);
  return `${size} ${gigabytes ? "GB" : "MB"}`;
}
