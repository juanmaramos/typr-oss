import { type ModelDomain, modelLifecycleQueryOptions, subscribeModelLifecycle } from "@/lib/model-lifecycle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

export type { ModelInfo, ModelStateEvent } from "@/lib/model-lifecycle";
export type { ModelStateEvent as LlmModelStateEvent } from "@/lib/model-lifecycle";

/** Keep native subscriptions alive across routes without rerendering the app on progress events. */
export function useModelLifecycleSync() {
  const client = useQueryClient();
  useEffect(() => {
    const release = subscribeModelLifecycle(client);
    // Prefetch records each failure in its own query, available to domain observers.
    void client.prefetchQuery(modelLifecycleQueryOptions(client, "stt"));
    void client.prefetchQuery(modelLifecycleQueryOptions(client, "llm"));
    return release;
  }, [client]);
}

export function useModelLifecycle(domain: ModelDomain) {
  const client = useQueryClient();
  useEffect(() => subscribeModelLifecycle(client), [client]);
  const query = useQuery(modelLifecycleQueryOptions(client, domain));
  const models = useMemo(() => query.data ? Object.values(query.data) : undefined, [query.data]);
  const getModel = useCallback((id: string) => query.data?.[id], [query.data]);
  return { ...query, models, getModel };
}

/** Artifact/runtime state only. Selection and domain readiness belong to domain policies. */
export function useModelState() {
  const stt = useModelLifecycle("stt");
  const llm = useModelLifecycle("llm");
  const models = useMemo(() => [...(stt.models ?? []), ...(llm.models ?? [])], [stt.models, llm.models]);
  const getModel = useCallback((id: string) => stt.getModel(id) ?? llm.getModel(id), [stt.getModel, llm.getModel]);
  const isDownloaded = useCallback((id: string) => getModel(id)?.isDownloaded ?? false, [getModel]);
  const isDownloading = useCallback((id: string) => getModel(id)?.isDownloading ?? false, [getModel]);
  const isModelLoading = useCallback((id: string) => getModel(id)?.isLoading ?? false, [getModel]);
  const isReady = useCallback((id: string) => getModel(id)?.isReady ?? false, [getModel]);
  const getProgress = useCallback((id: string) => getModel(id)?.progress ?? 0, [getModel]);
  const getError = useCallback((id: string) => getModel(id)?.error, [getModel]);
  return {
    models,
    getModel,
    isLoading: stt.isPending || llm.isPending,
    isError: stt.isError || llm.isError,
    error: stt.error ?? llm.error,
    stt,
    llm,
    isDownloaded,
    isDownloading,
    isModelLoading,
    isReady,
    getProgress,
    getError,
  };
}
