/**
 * Safe Analytics Utility - Prevents UI Freezing
 *
 * Wraps analytics calls with timeout protection to prevent the UI from
 * freezing when analytics requests hang indefinitely in production builds.
 *
 * Based on fix pattern from: apps/desktop/src/components/right-panel/hooks/useChatLogic.ts:391-397
 */

import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { isUsageAnalyticsEnabled, sanitizeAnalyticsEvent } from "./telemetry";

interface AnalyticsEvent {
  event: string;
  distinct_id: string;
  [key: string]: any;
}

const ANALYTICS_TIMEOUT_MS = 2000; // 2 seconds - analytics should never block UI longer

function normalizeAnalyticsEvent(event: AnalyticsEvent): AnalyticsEvent {
  const nestedProperties = event.properties;

  if (!nestedProperties || typeof nestedProperties !== "object" || Array.isArray(nestedProperties)) {
    return event;
  }

  const { properties: _properties, ...baseEvent } = event;
  return {
    ...(nestedProperties as Record<string, unknown>),
    ...baseEvent,
  };
}

/**
 * Safe analytics event call with timeout protection
 *
 * @param event - Analytics event data
 * @param timeoutMs - Custom timeout in milliseconds (default: 2000ms)
 * @returns Promise that resolves when analytics succeeds or times out
 */
export async function safeAnalyticsEvent(
  event: AnalyticsEvent,
  timeoutMs: number = ANALYTICS_TIMEOUT_MS,
): Promise<void> {
  if (!isUsageAnalyticsEnabled()) {
    return;
  }

  try {
    const sanitizedEvent = sanitizeAnalyticsEvent(normalizeAnalyticsEvent(event));

    // Race between analytics call and timeout
    await Promise.race([
      analyticsCommands.event(sanitizedEvent),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Analytics timeout")), timeoutMs)),
    ]);
  } catch (error) {
    // Analytics failures should not block the UI
    console.warn("Analytics call failed or timed out:", error);
    // Continue execution - this is intentionally non-blocking
  }
}

/**
 * Fire-and-forget analytics event (completely non-blocking)
 *
 * @param event - Analytics event data
 */
export function fireAnalyticsEvent(event: AnalyticsEvent): void {
  // Don't await this - fire and forget
  safeAnalyticsEvent(event).catch(() => {
    // Silently handle any errors - analytics should never affect UX
  });
}

/**
 * Batch analytics events with timeout protection
 *
 * @param events - Array of analytics events
 * @param timeoutMs - Custom timeout per event
 */
export async function safeBatchAnalyticsEvents(
  events: AnalyticsEvent[],
  timeoutMs: number = ANALYTICS_TIMEOUT_MS,
): Promise<void> {
  // Process all events in parallel with individual timeout protection
  const promises = events.map(event => safeAnalyticsEvent(event, timeoutMs));

  try {
    await Promise.allSettled(promises);
  } catch (error) {
    // This should never throw since safeAnalyticsEvent handles its own errors
    console.warn("Unexpected error in batch analytics:", error);
  }
}

// Re-export for easy migration from direct analytics calls
export { analyticsCommands };
