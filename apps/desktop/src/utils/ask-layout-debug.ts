const DEBUG_KEY = "DEBUG_ASK_LAYOUT";

export function isAskLayoutDebugEnabled() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_KEY) === "true";
  } catch {
    return false;
  }
}

export function logAskLayoutDebug(event: string, details: Record<string, unknown>) {
  if (!isAskLayoutDebugEnabled()) {
    return;
  }

  console.debug(`[ask-layout] ${event}`, details);
}
