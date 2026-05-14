import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { commands as sseCommands } from "@typr/plugin-sse";

// Global flag for enabling browser search (set by research mode)
let enableBrowserSearchHeader = false;

export function setEnableBrowserSearch(enable: boolean) {
  enableBrowserSearchHeader = enable;
}

// Cached user ID for optional downstream request metadata.
let cachedUserId: string | null = null;

export function setUserIdHeader(userId: string | null) {
  cachedUserId = userId;
}

export const fetch = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => {
  if (!isTauri()) {
    return globalThis.fetch(input, init);
  }

  const headers = init?.headers instanceof Headers ? Array.from(init.headers.entries()) : [];

  // Check if it's an SSE request based on headers
  const hasSSEHeader = headers.some(
    ([key, value]) =>
      key.toLowerCase() === "accept"
      && value.toLowerCase() === "text/event-stream",
  );

  // Force SSE fetch for known streaming provider endpoints.
  const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
  const isStreamingEndpoint = url.includes("api.openai.com")
    || url.includes("api.groq.com")
    || url.includes("openrouter.ai");

  void enableBrowserSearchHeader;
  void cachedUserId;

  const isSSE = hasSSEHeader || isStreamingEndpoint;
  const f = isSSE ? sseCommands.fetch : tauriFetch;

  return f(input, init);
};
