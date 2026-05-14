/**
 * Simple debug logger that can be enabled/disabled
 * Set DEBUG_NOTES_LIST=true in localStorage to enable
 */
export function isDebugEnabled(key: string): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(key) === "true";
}

export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled("DEBUG_NOTES_LIST")) {
    console.log("[DEBUG]", ...args);
  }
}

export function debugLogFor(key: string, label: string, ...args: unknown[]): void {
  if (isDebugEnabled(key)) {
    console.log(`[${label}]`, ...args);
  }
}

export function debugWarnFor(key: string, label: string, ...args: unknown[]): void {
  if (isDebugEnabled(key)) {
    console.warn(`[${label}]`, ...args);
  }
}
