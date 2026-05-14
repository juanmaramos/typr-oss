type NewNoteTrace = {
  id: string;
  source: string;
  startedAt: number;
  lastAt: number;
};

declare global {
  interface Window {
    __TYPR_NEW_NOTE_TRACE__?: NewNoteTrace;
  }
}

const DEBUG_KEY = "DEBUG_NEW_NOTE";

function canUseBrowserApis() {
  return typeof window !== "undefined" && typeof window.performance !== "undefined";
}

function now() {
  return canUseBrowserApis() ? window.performance.now() : Date.now();
}

function formatMs(value: number) {
  return Math.round(value * 10) / 10;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isNewNoteDebugEnabled() {
  if (import.meta.env.DEV) {
    return true;
  }

  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_KEY) === "true";
  } catch {
    return false;
  }
}

export function beginNewNoteTrace(source: string) {
  if (!isNewNoteDebugEnabled() || !canUseBrowserApis()) {
    return null;
  }

  const timestamp = now();
  const trace: NewNoteTrace = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    source,
    startedAt: timestamp,
    lastAt: timestamp,
  };

  window.__TYPR_NEW_NOTE_TRACE__ = trace;
  console.log(`[new-note:${trace.id}] start`, { source });

  return trace;
}

export function markNewNoteTrace(
  step: string,
  details?: Record<string, unknown>,
  options?: { createIfMissingSource?: string },
) {
  if (!isNewNoteDebugEnabled() || !canUseBrowserApis()) {
    return;
  }

  const trace = window.__TYPR_NEW_NOTE_TRACE__
    ?? (options?.createIfMissingSource ? beginNewNoteTrace(options.createIfMissingSource) : null);

  if (!trace) {
    return;
  }

  const timestamp = now();
  const totalMs = formatMs(timestamp - trace.startedAt);
  const deltaMs = formatMs(timestamp - trace.lastAt);
  trace.lastAt = timestamp;

  console.log(`[new-note:${trace.id}] ${step}`, {
    totalMs,
    deltaMs,
    ...details,
  });
}

export async function timeNewNoteStep<T>(
  step: string,
  action: () => Promise<T>,
  details?: Record<string, unknown>,
) {
  const start = now();

  try {
    const result = await action();
    markNewNoteTrace(`${step}:done`, {
      ms: formatMs(now() - start),
      ...details,
    });
    return result;
  } catch (error) {
    markNewNoteTrace(`${step}:error`, {
      ms: formatMs(now() - start),
      error: getErrorMessage(error),
      ...details,
    });
    throw error;
  }
}

export function finishNewNoteTrace(step: string, details?: Record<string, unknown>) {
  markNewNoteTrace(step, details);
}
