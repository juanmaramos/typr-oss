import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export class EmptyChatResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyChatResponseError";
  }
}

export function getUserFriendlyChatErrorMessage(error: unknown): string {
  const errorDetails = error instanceof Error ? error.message : String(error);

  if (error instanceof EmptyChatResponseError) {
    return i18n._(msg`The AI model returned an empty response. This might be temporary - please try again.`);
  }
  // Provider errors remain external technical messages; app errors use typed identity above.
  if (errorDetails.includes("Rate limit") || errorDetails.includes("429")) {
    return i18n._(
      msg`⏳ The AI model's rate limit has been reached. Please wait a moment and try again, or switch to a different model in Settings.`,
    );
  }
  if (errorDetails.includes("empty response")) {
    return i18n._(msg`The AI model returned an empty response. This might be temporary - please try again.`);
  }
  return i18n._(msg`Sorry, I encountered an error: ${errorDetails}. Please try again.`);
}
