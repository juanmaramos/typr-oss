// @vitest-environment jsdom
import { useModelLifecycle, useModelLifecycleSync } from "@/hooks/useModelState";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { commands as llmCommands } from "@typr/plugin-local-llm";
import { commands as sttCommands } from "@typr/plugin-local-stt";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ModelDomain,
  modelLifecycleKey,
  modelLifecycleQueryOptions,
  type ModelStateEvent,
  type ModelStateMap,
  subscribeModelLifecycle,
} from "./model-lifecycle";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@typr/plugin-local-stt", () => ({
  commands: { listSupportedModels: vi.fn(), isModelDownloaded: vi.fn(), isModelDownloading: vi.fn() },
}));
vi.mock("@typr/plugin-local-llm", () => ({
  commands: { listSupportedModels: vi.fn(), isModelDownloaded: vi.fn(), isModelDownloading: vi.fn() },
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("shared native model lifecycle", () => {
  let client: QueryClient;
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  const releases: (() => void)[] = [];
  let callbacks: Map<string, (event: { payload: ModelStateEvent }) => void>;
  let unlisteners: ReturnType<typeof vi.fn>[];
  let timestamp: number;

  beforeEach(() => {
    vi.resetAllMocks();
    callbacks = new Map();
    unlisteners = [];
    timestamp = Date.now();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    vi.mocked(sttCommands.listSupportedModels).mockResolvedValue(["QuantizedBase"]);
    vi.mocked(llmCommands.listSupportedModels).mockResolvedValue([{ id: "Gemma4E4b" }] as never);
    vi.mocked(sttCommands.isModelDownloaded).mockResolvedValue(false);
    vi.mocked(sttCommands.isModelDownloading).mockResolvedValue(false);
    vi.mocked(llmCommands.isModelDownloaded).mockResolvedValue(true);
    vi.mocked(llmCommands.isModelDownloading).mockResolvedValue(false);
    vi.mocked(listen).mockImplementation(async (name, callback) => {
      callbacks.set(name, callback as (event: { payload: ModelStateEvent }) => void);
      const unlisten = vi.fn(() => {
        if (callbacks.get(name) === callback) {
          callbacks.delete(name);
        }
      });
      unlisteners.push(unlisten);
      return unlisten;
    });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    notifyManager.setNotifyFunction(callback => act(() => callback()));
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    releases.splice(0).forEach(release => release());
    client.clear();
    host?.remove();
    root = undefined;
    host = undefined;
    notifyManager.setNotifyFunction(callback => callback());
  });

  const subscribe = () => releases.push(subscribeModelLifecycle(client));
  const read = (domain: ModelDomain) => client.fetchQuery(modelLifecycleQueryOptions(client, domain));
  const model = (domain: ModelDomain, id: string) =>
    client.getQueryData<ModelStateMap>(modelLifecycleKey(domain))?.[id];
  const emit = (domain: ModelDomain, id: string, state: ModelStateEvent["state"]) => {
    callbacks.get(`${domain}-model-state-changed`)?.({ payload: { model_id: id, state, timestamp: ++timestamp } });
  };

  it("shares one listener pair and native snapshot between multiple hook consumers", async () => {
    const results = new Map<string, ReturnType<typeof useModelLifecycle>>();
    function Consumer({ id, domain }: { id: string; domain: ModelDomain }) {
      results.set(id, useModelLifecycle(domain));
      return null;
    }
    host = document.createElement("div");
    root = createRoot(host);
    await act(async () =>
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(Consumer, { id: "settings", domain: "stt" }),
          createElement(Consumer, { id: "transcript", domain: "stt" }),
          createElement(Consumer, { id: "chat", domain: "llm" }),
        ),
      )
    );
    await vi.waitFor(() => expect(results.get("settings")?.isSuccess).toBe(true));
    expect(results.get("settings")?.data).toBe(results.get("transcript")?.data);
    expect(listen).toHaveBeenCalledTimes(2);
    expect(sttCommands.listSupportedModels).toHaveBeenCalledTimes(1);
    expect(llmCommands.listSupportedModels).toHaveBeenCalledTimes(1);
    await act(async () => emit("stt", "QuantizedBase", { Downloading: { progress: 37 } }));
    await vi.waitFor(() => expect(results.get("transcript")?.getModel("QuantizedBase")?.progress).toBe(37));
    expect(results.get("chat")?.getModel("Gemma4E4b")?.isDownloaded).toBe(true);
    await act(async () => root?.unmount());
    root = undefined;
    expect(unlisteners.every(unlisten => unlisten.mock.calls.length === 1)).toBe(true);
  });

  it("registers before reads and preserves progress, Ready, and errors arriving during bootstrap", async () => {
    const artifact = deferred<boolean>();
    vi.mocked(sttCommands.isModelDownloaded).mockReturnValue(artifact.promise);
    vi.mocked(sttCommands.listSupportedModels).mockImplementation(async () => {
      expect(callbacks.has("stt-model-state-changed")).toBe(true);
      return ["QuantizedBase"];
    });
    subscribe();
    const pending = read("stt");
    await vi.waitFor(() => expect(sttCommands.isModelDownloaded).toHaveBeenCalled());
    expect(client.getQueryData(modelLifecycleKey("stt"))).toBeUndefined();
    emit("stt", "QuantizedBase", { Downloading: { progress: 61 } });
    artifact.resolve(false);
    expect((await pending).QuantizedBase.progress).toBe(61);

    const llmArtifact = deferred<boolean>();
    vi.mocked(llmCommands.isModelDownloaded).mockReturnValue(llmArtifact.promise);
    const llmPending = read("llm");
    await vi.waitFor(() => expect(llmCommands.isModelDownloaded).toHaveBeenCalled());
    emit("llm", "Gemma4E4b", "Ready");
    emit("llm", "Gemma4E4b", { Error: { message: "runtime failed" } });
    llmArtifact.resolve(false);
    expect((await llmPending).Gemma4E4b).toMatchObject({
      isDownloaded: true,
      isReady: false,
      error: "runtime failed",
    });
  });

  it("merges refetch events and keeps known runtime readiness across artifact-only refreshes", async () => {
    subscribe();
    await read("llm");
    emit("llm", "Gemma4E4b", "Ready");
    await client.invalidateQueries({ queryKey: modelLifecycleKey("llm"), refetchType: "none" });
    await read("llm");
    expect(model("llm", "Gemma4E4b")?.isReady).toBe(true);

    await read("stt");
    const artifact = deferred<boolean>();
    vi.mocked(sttCommands.isModelDownloaded).mockReturnValue(artifact.promise);
    await client.invalidateQueries({ queryKey: modelLifecycleKey("stt"), refetchType: "none" });
    const refreshing = read("stt");
    await vi.waitFor(() => expect(sttCommands.isModelDownloaded).toHaveBeenCalledTimes(2));
    emit("stt", "QuantizedBase", "Downloaded");
    artifact.resolve(false);
    await refreshing;
    expect(model("stt", "QuantizedBase")?.isDownloaded).toBe(true);
  });

  it("reports domain failures instead of empty success, leaves the other domain usable, and retries", async () => {
    const failure = new Error("STT disk read failed");
    vi.mocked(sttCommands.listSupportedModels).mockRejectedValue(failure);
    subscribe();
    await expect(read("stt")).rejects.toThrow(failure);
    await read("llm");
    expect(client.getQueryState(modelLifecycleKey("stt"))).toMatchObject({
      status: "error",
      data: undefined,
      error: failure,
    });
    expect(model("llm", "Gemma4E4b")?.isDownloaded).toBe(true);
    emit("stt", "QuantizedBase", "Downloaded");
    expect(client.getQueryState(modelLifecycleKey("stt"))?.status).toBe("error");
    vi.mocked(sttCommands.listSupportedModels).mockResolvedValue(["QuantizedBase"]);
    vi.mocked(sttCommands.isModelDownloaded).mockResolvedValue(true);
    await read("stt");
    expect(model("stt", "QuantizedBase")?.isDownloaded).toBe(true);
    expect(listen).toHaveBeenCalledTimes(2);
  });

  it("does not let a single event clear a failed full-domain refresh", async () => {
    subscribe();
    await read("llm");
    vi.mocked(llmCommands.listSupportedModels).mockRejectedValue(new Error("refresh failed"));
    await client.invalidateQueries({ queryKey: modelLifecycleKey("llm"), refetchType: "none" });
    await expect(read("llm")).rejects.toThrow("refresh failed");
    emit("llm", "Gemma4E4b", "Ready");
    expect(model("llm", "Gemma4E4b")?.isReady).toBe(true);
    expect(client.getQueryState(modelLifecycleKey("llm"))?.status).toBe("error");
  });

  it("clears every runtime/download flag on NotDownloaded and keeps domains separate even for the same id", async () => {
    subscribe();
    await Promise.all([read("stt"), read("llm")]);
    emit("stt", "Gemma4E4b", "Downloaded");
    emit("llm", "Gemma4E4b", "Ready");
    emit("llm", "Gemma4E4b", "NotDownloaded");
    expect(model("llm", "Gemma4E4b")).toMatchObject({ isDownloaded: false, isReady: false });
    emit("llm", "Gemma4E4b", "Loading");
    emit("llm", "Gemma4E4b", "NotDownloaded");
    expect(model("llm", "Gemma4E4b")?.isLoading).toBe(false);
    emit("llm", "Gemma4E4b", { Error: { message: "failed" } });
    emit("llm", "Gemma4E4b", { Downloading: { progress: 74 } });
    emit("llm", "Gemma4E4b", "NotDownloaded");
    expect(model("llm", "Gemma4E4b")).toMatchObject({
      isDownloaded: false,
      isDownloading: false,
      isLoading: false,
      isReady: false,
      progress: 0,
      error: undefined,
    });
    expect(model("stt", "Gemma4E4b")?.isDownloaded).toBe(true);
  });

  it("surfaces listener registration failures independently and retries the failed listener", async () => {
    vi.mocked(listen).mockRejectedValueOnce(new Error("STT listener unavailable"));
    subscribe();
    await expect(read("stt")).rejects.toThrow("STT listener unavailable");
    await read("llm");
    expect(model("llm", "Gemma4E4b")?.isDownloaded).toBe(true);
    await read("stt");
    expect(client.getQueryState(modelLifecycleKey("stt"))?.status).toBe("success");
    expect(listen).toHaveBeenCalledTimes(3);
  });

  it("cleans late registrations on unmount and reconciles artifacts on the next mount", async () => {
    const late = deferred<() => void>();
    const unlisten = vi.fn();
    vi.mocked(listen).mockReturnValueOnce(late.promise);
    const release = subscribeModelLifecycle(client);
    release();
    late.resolve(unlisten);
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(unlisteners[0]).toHaveBeenCalledOnce();
    subscribe();
    await read("llm");
    emit("llm", "Gemma4E4b", "Ready");
    releases.pop()?.();
    vi.mocked(llmCommands.isModelDownloaded).mockResolvedValue(false);
    subscribe();
    await read("llm");
    expect(model("llm", "Gemma4E4b")).toMatchObject({ isDownloaded: false, isReady: false });
  });

  it("clears an earlier download error when a fresh artifact check confirms retry activity or success", async () => {
    subscribe();
    await read("stt");
    emit("stt", "QuantizedBase", { Error: { message: "download failed" } });
    vi.mocked(sttCommands.isModelDownloading).mockResolvedValue(true);
    await client.invalidateQueries({ queryKey: modelLifecycleKey("stt"), refetchType: "none" });
    await read("stt");
    expect(model("stt", "QuantizedBase")?.isDownloading).toBe(true);
    expect(model("stt", "QuantizedBase")?.error).toBeUndefined();
    emit("stt", "QuantizedBase", { Error: { message: "retry failed" } });
    vi.mocked(sttCommands.isModelDownloading).mockResolvedValue(false);
    vi.mocked(sttCommands.isModelDownloaded).mockResolvedValue(true);
    await client.invalidateQueries({ queryKey: modelLifecycleKey("stt"), refetchType: "none" });
    await read("stt");
    expect(model("stt", "QuantizedBase")).toMatchObject({ isDownloaded: true, isDownloading: false, error: undefined });

    await read("llm");
    emit("llm", "Gemma4E4b", "Ready");
    emit("llm", "Gemma4E4b", { Error: { message: "runtime failed" } });
    await client.invalidateQueries({ queryKey: modelLifecycleKey("llm"), refetchType: "none" });
    await read("llm");
    expect(model("llm", "Gemma4E4b")).toMatchObject({ isDownloaded: true, isReady: false, error: "runtime failed" });
    emit("llm", "Gemma4E4b", "Ready");
    expect(model("llm", "Gemma4E4b")).toMatchObject({ isReady: true, error: undefined });
  });

  it("restarts bootstrap prefetches after StrictMode effect replay without query observers", async () => {
    function Bootstrap() {
      useModelLifecycleSync();
      return null;
    }
    host = document.createElement("div");
    root = createRoot(host);
    await act(async () =>
      root?.render(
        createElement(StrictMode, null, createElement(QueryClientProvider, { client }, createElement(Bootstrap))),
      )
    );
    await vi.waitFor(() => {
      expect(client.getQueryState(modelLifecycleKey("stt"))?.status).toBe("success");
      expect(client.getQueryState(modelLifecycleKey("llm"))?.status).toBe("success");
    });
    expect(callbacks.size).toBe(2);
    expect(sttCommands.listSupportedModels).toHaveBeenCalledTimes(1);
    expect(llmCommands.listSupportedModels).toHaveBeenCalledTimes(1);
  });

  it("replaces a disposed in-flight prefetch instead of reusing its cancelled read", async () => {
    const staleArtifact = deferred<boolean>();
    vi.mocked(sttCommands.isModelDownloaded).mockReturnValueOnce(staleArtifact.promise);
    const release = subscribeModelLifecycle(client);
    const stale = client.prefetchQuery(modelLifecycleQueryOptions(client, "stt"));
    await vi.waitFor(() => expect(sttCommands.isModelDownloaded).toHaveBeenCalledTimes(1));
    release();
    subscribe();
    const current = client.prefetchQuery(modelLifecycleQueryOptions(client, "stt"));
    staleArtifact.resolve(true);
    await Promise.all([stale, current]);
    expect(client.getQueryState(modelLifecycleKey("stt"))?.status).toBe("success");
    expect(model("stt", "QuantizedBase")?.isDownloaded).toBe(false);
    expect(sttCommands.isModelDownloaded).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      state: "Downloaded" as const,
      downloaded: false,
      expected: { isDownloaded: false, isDownloading: false, progress: 0 },
    },
    {
      state: { Downloading: { progress: 74 } },
      downloaded: false,
      expected: { isDownloaded: false, isDownloading: false, progress: 0 },
    },
    {
      state: { Error: { message: "download failed" } },
      downloaded: true,
      expected: { isDownloaded: true, isDownloading: false, error: undefined },
    },
  ])(
    "reconciles pre-retry artifact events with a fresh successful snapshot: $state",
    async ({ state, downloaded, expected }) => {
      subscribe();
      vi.mocked(sttCommands.listSupportedModels).mockRejectedValueOnce(new Error("initial read failed"));
      await expect(read("stt")).rejects.toThrow("initial read failed");
      emit("stt", "QuantizedBase", state);
      vi.mocked(sttCommands.isModelDownloaded).mockResolvedValue(downloaded);
      await read("stt");
      expect(model("stt", "QuantizedBase")).toMatchObject(expected);
    },
  );

  it("handles StrictMode effect replay without leaving duplicate active listeners", async () => {
    function Consumer() {
      useModelLifecycle("stt");
      return null;
    }
    host = document.createElement("div");
    root = createRoot(host);
    await act(async () =>
      root?.render(
        createElement(StrictMode, null, createElement(QueryClientProvider, { client }, createElement(Consumer))),
      )
    );
    await vi.waitFor(() => expect(client.getQueryState(modelLifecycleKey("stt"))?.status).toBe("success"));
    expect(callbacks.size).toBe(2);
    await act(async () => root?.unmount());
    root = undefined;
    expect(unlisteners.every(unlisten => unlisten.mock.calls.length === 1)).toBe(true);
  });
});
