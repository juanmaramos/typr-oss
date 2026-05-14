import * as Sentry from "@sentry/react";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim() || "";
const sentryRelease = import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined;

let usageAnalyticsEnabled = true;
let sentryInitialized = false;

type Breadcrumb = Parameters<typeof Sentry.addBreadcrumb>[0];
type CaptureContext = Parameters<typeof Sentry.captureException>[1];

const SENSITIVE_EVENT_KEYS = new Set([
  "api_key",
  "content",
  "email",
  "file_name",
  "file_path",
  "group_id",
  "note_id",
  "path",
  "prompt",
  "selection",
  "session_id",
  "source_title",
  "text",
  "thread_id",
  "title",
  "transcript",
  "url",
]);

function scrubString(value: string) {
  return value
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi, "[id]")
    .replace(/\b(?:sk|gsk|aai|sk-or)_[A-Za-z0-9_-]{12,}\b/g, "[api-key]")
    .replace(/\b(?:sk|gsk|aai|sk-or)-[A-Za-z0-9_-]{12,}\b/g, "[api-key]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_EVENT_KEYS.has(key))
      .map(([key, nestedValue]) => [key, scrubValue(nestedValue)]),
  );
}

function scrubSentryEvent(event: Sentry.ErrorEvent) {
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  delete event.request;
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data ? scrubValue(breadcrumb.data) as Record<string, unknown> : undefined,
  }));

  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }

  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  }

  return event;
}

function initSentryIfNeeded() {
  if (sentryInitialized || !sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    release: sentryRelease,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()],
    sendDefaultPii: false,
    debug: false,
    environment: import.meta.env.DEV ? "development" : "production",
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    initialScope: {
      tags: {
        component: "desktop-app",
        platform: "tauri",
        distribution: "oss",
      },
    },
  });

  sentryInitialized = true;
}

export function setUsageAnalyticsEnabled(enabled: boolean) {
  usageAnalyticsEnabled = enabled;
  initSentryIfNeeded();
}

export function isUsageAnalyticsEnabled() {
  return usageAnalyticsEnabled;
}

export function setTelemetryUser(userId: string) {
  initSentryIfNeeded();
  Sentry.setUser({ id: userId });
}

export function addTelemetryBreadcrumb(breadcrumb: Breadcrumb) {
  initSentryIfNeeded();
  Sentry.addBreadcrumb({
    ...breadcrumb,
    message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data ? scrubValue(breadcrumb.data) as Record<string, unknown> : undefined,
  });
}

export function captureTelemetryException(error: unknown, context?: CaptureContext) {
  initSentryIfNeeded();
  Sentry.captureException(error, context);
}

export function captureTelemetryMessage(
  message: string,
  level: Parameters<typeof Sentry.captureMessage>[1] = "error",
) {
  initSentryIfNeeded();
  Sentry.captureMessage(scrubString(message), level);
}

export function sanitizeAnalyticsEvent<T extends Record<string, unknown>>(event: T): T {
  return scrubValue(event) as T;
}
