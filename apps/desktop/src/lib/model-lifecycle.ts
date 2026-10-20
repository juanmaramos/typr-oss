import { safeUnlisten } from "@/utils/safe-unlisten";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands as llmCommands } from "@typr/plugin-local-llm";
import { commands as sttCommands } from "@typr/plugin-local-stt";

export type ModelDomain = "stt" | "llm";
export interface ModelInfo {
  id: string;
  isDownloaded: boolean;
  isDownloading: boolean;
  isLoading: boolean;
  isReady: boolean;
  progress: number;
  error?: string;
  lastUpdated: number;
}
export type ModelStateMap = Record<string, ModelInfo>;
export interface ModelStateEvent {
  model_id: string;
  state: "NotDownloaded" | "Downloaded" | "Loading" | "Ready" | { Downloading: { progress: number } } | {
    Error: { message: string };
  };
  timestamp: number;
}

export const modelLifecycleKey = (domain: ModelDomain) => ["model-lifecycle", domain] as const;
const controllers = new WeakMap<QueryClient, LifecycleController>();

function eventModel(event: ModelStateEvent, previous?: ModelInfo): ModelInfo {
  const { model_id: id, state, timestamp: lastUpdated } = event;
  const downloading = typeof state === "object" && "Downloading" in state;
  const error = typeof state === "object" && "Error" in state ? state.Error.message : undefined;
  return {
    id,
    isDownloaded: state === "Downloaded" || state === "Loading" || state === "Ready"
      || (error !== undefined && previous?.isDownloaded === true),
    isDownloading: downloading,
    isLoading: state === "Loading",
    isReady: state === "Ready",
    progress: downloading ? state.Downloading.progress : 0,
    error,
    lastUpdated,
  };
}

/** One native subscription pair for a QueryClient, shared by all lifecycle observers. */
class LifecycleController {
  references = 0;
  disposed = false;
  private revision = 0;
  private events: Record<ModelDomain, Map<string, { revision: number; model: ModelInfo }>> = {
    stt: new Map(),
    llm: new Map(),
  };
  private registrations = new Map<ModelDomain, Promise<Error | null>>();
  private failedRegistrations = new Set<ModelDomain>();
  private unlisteners: UnlistenFn[] = [];

  constructor(private client: QueryClient) {
    this.register("stt");
    this.register("llm");
  }

  private register(domain: ModelDomain) {
    const registration = listen<ModelStateEvent>(`${domain}-model-state-changed`, ({ payload }) => {
      if (this.disposed) {
        return;
      }
      const key = modelLifecycleKey(domain);
      const previous = this.client.getQueryData<ModelStateMap>(key)?.[payload.model_id]
        ?? this.events[domain].get(payload.model_id)?.model;
      const previousEvent = this.events[domain].get(payload.model_id);
      if (previousEvent && payload.timestamp < previousEvent.model.lastUpdated) {
        return;
      }
      const model = eventModel(payload, previous);
      this.events[domain].set(model.id, { revision: ++this.revision, model });
      // Do not turn a partial event into a successful, complete native snapshot.
      const query = this.client.getQueryCache().find<ModelStateMap>({ queryKey: key });
      if (query?.state.data !== undefined) {
        // An event updates model data, but cannot repair a failed full-domain read.
        query.setState({ data: { ...query.state.data, [model.id]: model } });
      }
    }).then(unlisten => {
      if (this.disposed) {
        safeUnlisten(unlisten, `model-lifecycle.${domain}.late-dispose`);
      } else {
        this.unlisteners.push(unlisten);
      }
      return null;
    }, error => {
      this.failedRegistrations.add(domain);
      return error instanceof Error ? error : new Error(String(error));
    });
    this.registrations.set(domain, registration);
  }

  async read(domain: ModelDomain, signal: AbortSignal): Promise<ModelStateMap> {
    if (this.failedRegistrations.delete(domain)) {
      this.register(domain);
    }
    const registrationError = await this.registrations.get(domain);
    if (registrationError) {
      throw registrationError;
    }
    if (signal.aborted || this.disposed) {
      throw new Error("model_lifecycle_read_cancelled");
    }
    const startedAt = this.revision;
    const records = domain === "stt"
      ? (await sttCommands.listSupportedModels()).map(id => ({
        id,
        downloaded: () => sttCommands.isModelDownloaded(id),
        downloading: () => sttCommands.isModelDownloading(id),
      }))
      : (await llmCommands.listSupportedModels()).map(({ id }) => ({
        id,
        downloaded: () => llmCommands.isModelDownloaded(id),
        downloading: () => llmCommands.isModelDownloading(id),
      }));
    const models = await Promise.all(records.map(async ({ id, downloaded, downloading }) => {
      const [isDownloaded, isDownloading] = await Promise.all([downloaded(), downloading()]);
      return {
        id,
        isDownloaded,
        isDownloading,
        isLoading: false,
        isReady: false,
        progress: 0,
        lastUpdated: Date.now(),
      } satisfies ModelInfo;
    }));
    if (signal.aborted || this.disposed) {
      throw new Error("model_lifecycle_read_cancelled");
    }
    const snapshot: ModelStateMap = Object.fromEntries(models.map(model => [model.id, model]));
    for (const model of models) {
      const known = this.events[domain].get(model.id)?.model;
      // Fresh artifact checks supersede old download events. Only runtime
      // readiness/errors on an already downloaded artifact need event history.
      if (known && model.isDownloaded && !model.isDownloading) {
        snapshot[model.id] = {
          ...model,
          isLoading: known.isLoading,
          isReady: known.isReady,
          error: known.isDownloaded ? known.error : undefined,
        };
      } else if (known?.isDownloading && model.isDownloading) {
        snapshot[model.id] = { ...model, progress: known.progress };
      } else if (known?.error && !model.isDownloading) {
        snapshot[model.id] = { ...model, error: known.error };
      }
    }
    for (const [id, event] of this.events[domain]) {
      // Events received during this read are newer than its artifact checks.
      if (event.revision > startedAt) {
        snapshot[id] = event.model;
      }
    }
    return snapshot;
  }

  dispose() {
    this.disposed = true;
    // Prefetches have no observers to cancel them on unmount. Cancel their
    // retryers now so an immediate remount starts a read on its new controller.
    void this.client.cancelQueries({ queryKey: ["model-lifecycle"] });
    this.unlisteners.forEach(unlisten => safeUnlisten(unlisten, "model-lifecycle"));
    // A later mount must reconcile any events missed while no view was subscribed.
    void this.client.invalidateQueries({ queryKey: ["model-lifecycle"], refetchType: "none" });
  }
}

function getController(client: QueryClient) {
  let controller = controllers.get(client);
  if (!controller) {
    controller = new LifecycleController(client);
    controllers.set(client, controller);
  }
  return controller;
}

export function subscribeModelLifecycle(client: QueryClient) {
  const controller = getController(client);
  controller.references++;
  return () => {
    if (--controller.references === 0) {
      controller.dispose();
      controllers.delete(client);
    }
  };
}

export function modelLifecycleQueryOptions(client: QueryClient, domain: ModelDomain) {
  return queryOptions({
    queryKey: modelLifecycleKey(domain),
    queryFn: ({ signal }) => getController(client).read(domain, signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
