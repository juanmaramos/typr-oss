import { messages as enMessages } from "@/locales/en/messages";
import { messages as esMessages } from "@/locales/es/messages";
import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmptyChatResponseError, getUserFriendlyChatErrorMessage } from "./chat-errors";

describe("chat generation error guidance", () => {
  beforeEach(() => {
    i18n.load({ en: enMessages, es: esMessages });
    i18n.activate("en");
  });
  afterEach(() => i18n.activate("en"));

  it("recognizes localized empty responses in both languages without parsing their message", () => {
    const guidance = new Map<string, string>();
    for (const locale of ["en", "es"]) {
      i18n.activate(locale);
      // Both messages deliberately lack the provider's English 'empty response' marker.
      const error = new EmptyChatResponseError(locale === "es" ? "Respuesta vacía del modelo" : "No generated text");
      const localizedGuidance = getUserFriendlyChatErrorMessage(error);
      expect(localizedGuidance).toBe(getUserFriendlyChatErrorMessage(new Error("provider: empty response")));
      expect(localizedGuidance).not.toContain(error.message);
      guidance.set(locale, localizedGuidance);
    }
    expect(guidance.get("en")).toBe(
      "The AI model returned an empty response. This might be temporary - please try again.",
    );
    expect(guidance.get("es")).not.toBe(guidance.get("en"));
  });

  it("retains provider rate-limit guidance and generic error details", () => {
    expect(getUserFriendlyChatErrorMessage(new Error("HTTP 429"))).toContain("rate limit");
    expect(getUserFriendlyChatErrorMessage(new Error("network disconnected"))).toContain("network disconnected");
  });
});
