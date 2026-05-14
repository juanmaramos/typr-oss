// Based on https://github.com/TanStack/query/blob/6d03341/packages/query-broadcast-client-experimental/src/index.ts

import type { QueryCacheNotifyEvent, QueryClient } from "@tanstack/react-query";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { safeUnlisten } from "./safe-unlisten";

const EVENT_NAME = "tanstack-query-broadcast";

type BroadcastEvent = {
  queryKey: QueryCacheNotifyEvent["query"]["queryKey"];
  window: string;
};

export function broadcastQueryClient(queryClient: QueryClient) {
  const queryCache = queryClient.getQueryCache();
  const currentWindow = getCurrentWebviewWindowLabel();

  // Guard against early initialization before window is ready
  if (!currentWindow) {
    console.warn("⚠️ broadcastQueryClient: Window not initialized yet, skipping broadcast setup");
    return () => {}; // Return no-op cleanup function
  }

  queryCache.subscribe((queryEvent) => {
    const updated = queryEvent.type === "updated" && queryEvent.action.type === "success";
    const removed = queryEvent.type === "removed";

    if (updated || removed) {
      emit(
        EVENT_NAME,
        {
          queryKey: queryEvent.query.queryKey,
          window: currentWindow,
        } satisfies BroadcastEvent,
      );
    }
  });

  let unlisten: UnlistenFn | null = null;
  let disposed = false;

  const setup = async () => {
    unlisten = await listen<BroadcastEvent>(EVENT_NAME, (event) => {
      if (event.payload.window === currentWindow) {
        return;
      }

      const keys = Array.isArray(event.payload.queryKey) ? event.payload.queryKey : [];
      const keyIncludes = (needle: string) => keys.some((key) => typeof key === "string" && key.includes(needle));

      if (keyIncludes("flags")) {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey.some((key) => typeof key === "string" && key.includes("flags")),
        });
      }

      if (keyIncludes("profile")) {
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some((key) =>
              typeof key === "string"
              && (key.includes("participant") || key.includes("human") || key.includes("org")
                || key.includes("profile"))
            ),
        });
      }

      if (keys[0] === "human") {
        queryClient.invalidateQueries({
          queryKey: ["human", keys[1]],
          predicate: (query) => query.queryKey.some((key) => typeof key === "string" && key.includes("participant")),
        });
      }

      if (keys[0] === "org") {
        queryClient.invalidateQueries({
          queryKey: ["org", keys[1]],
        });
      }
    });

    if (disposed) {
      safeUnlisten(unlisten, "broadcastQueryClient.listener.late-dispose");
      unlisten = null;
    }
  };

  setup().catch((error) => {
    console.error("[events] Failed to register broadcast listener", error);
  });

  return () => {
    disposed = true;
    safeUnlisten(unlisten, "broadcastQueryClient.listener");
  };
}
