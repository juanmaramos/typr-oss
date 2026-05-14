import "@typr/ui/globals.css";
import "remixicon/fonts/remixicon.css";
import "./styles/globals.css";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQueries, useQueryClient } from "@tanstack/react-query";
import { CatchBoundary, createRouter, ErrorComponent, RouterProvider } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { locale } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import { ErrorModal } from "@/components/error-modal";
import { recordingStartFailedToast } from "@/components/toast/shared";
import { scheduleProjectBriefRefreshForSession } from "@/lib/project-brief-refresh-scheduler";
import type { Context } from "@/types";
import {
  addTelemetryBreadcrumb,
  captureTelemetryMessage,
  setUsageAnalyticsEnabled,
  setTelemetryUser,
} from "@/utils/telemetry";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { commands as authCommands } from "@typr/plugin-auth";
import { commands as configCommands } from "@typr/plugin-config";
import { commands as dbCommands } from "@typr/plugin-db";
import { Toaster } from "@typr/ui/components/ui/toast";
import { TooltipProvider } from "@typr/ui/components/ui/tooltip";
import { ThemeProvider } from "@typr/ui/contexts/theme";
import { setUserIdHeader } from "@typr/utils";
import { createOngoingSessionStore, createSessionsStore } from "@typr/utils/stores";
import { broadcastQueryClient } from "./utils";

import { messages as enMessages } from "./locales/en/messages.po";
import { messages as esMessages } from "./locales/es/messages.po";

import { routeTree } from "./routeTree.gen";

// Add IMMEDIATE global error handler for Tauri IPC callback issues (before any async operations)
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  const errorMessage = error?.message || error?.toString() || "";

  // Handle Tauri IPC callback destructuring errors
  if (
    errorMessage.includes("undefined is not an object")
    && (errorMessage.includes("[callbackId, data]")
      || errorMessage.includes("callbackId")
      || errorMessage.includes("evaluating '["))
  ) {
    console.warn("🔧 [EARLY] Caught Tauri IPC callback destructuring error:", errorMessage);
    console.warn("This occurs when IPC protocol falls back to postMessage after failures");

    // Prevent the error from propagating to Sentry since it's a known Tauri issue
    event.preventDefault();
    return;
  }

  // Handle Tauri IPC load failures that can trigger callback issues
  if (errorMessage.includes("Load failed") || errorMessage.includes("IPC custom protocol failed")) {
    console.warn("🔧 [EARLY] Caught Tauri IPC protocol failure:", errorMessage);
    event.preventDefault();
    return;
  }
});

// Load messages and activate default locale synchronously
i18n.load({
  en: enMessages,
  es: esMessages,
});

// CRITICAL: Activate default locale immediately to prevent race conditions
// This ensures i18n.activate() is called before any component renders or utility runs
i18n.activate("en");

// Detect system language using Tauri's locale API
const detectSystemLanguage = async (): Promise<string> => {
  try {
    const systemLocale = await locale();
    if (systemLocale) {
      // Extract language code from BCP-47 format (e.g., "es-ES" -> "es")
      const languageCode = systemLocale.split("-")[0];
      if (languageCode === "es" || languageCode === "en") {
        return languageCode;
      }
    }
  } catch (error) {
    console.error("Failed to detect system language:", error);
  }

  // Fallback to browser detection
  const browserLang = navigator.language.startsWith("es") ? "es" : "en";
  return browserLang;
};

// Load language from user settings or default to system language
const loadUserLanguage = async () => {
  try {
    const general = await configCommands.getGeneralConfig();
    const telemetryConsent = general?.telemetry_consent ?? true;
    const userLanguage = general?.display_language;

    setUsageAnalyticsEnabled(telemetryConsent);
    analyticsCommands.setDisabled(!telemetryConsent).catch(console.error);

    if (userLanguage && (userLanguage === "es" || userLanguage === "en")) {
      // User has a saved language preference
      i18n.activate(userLanguage);
    } else {
      // No saved preference, detect system language
      const systemLanguage = await detectSystemLanguage();
      i18n.activate(systemLanguage);
    }
  } catch (error) {
    console.error("Failed to load user language preference:", error);
    setUsageAnalyticsEnabled(true);
    analyticsCommands.setDisabled(false).catch(console.error);
    // Use system language as fallback
    const systemLanguage = await detectSystemLanguage();
    i18n.activate(systemLanguage);
  }
};

// Don't load user language at module level - do it in the component

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // for most case, we don't want cache
      gcTime: 0,
    },
  },
});

const sessionsStore = createSessionsStore({
  onSessionPersisted: scheduleProjectBriefRefreshForSession,
});
const ongoingSessionStore = createOngoingSessionStore(sessionsStore, {
  onRecordingStartFailed: (error) => {
    recordingStartFailedToast();
  },
});

// Log recording lifecycle state transitions as Sentry breadcrumbs.
// When an error is reported, the breadcrumb trail shows exactly what the
// user was doing (start → pause → stop → enhance) leading up to the error.
ongoingSessionStore.subscribe((state, prevState) => {
  if (state.status !== prevState.status) {
    addTelemetryBreadcrumb({
      category: "recording",
      message: `Status: ${prevState.status} → ${state.status}`,
      level: "info",
      data: { recording_active: state.status !== "inactive" },
    });
  }
  if (state.sessionId !== prevState.sessionId) {
    addTelemetryBreadcrumb({
      category: "recording",
      message: state.sessionId ? "Session started" : "Session ended",
      level: "info",
    });
  }
});

const context: Context = {
  queryClient,
  ongoingSessionStore,
  sessionsStore,
};

const router = createRouter({
  routeTree,
  context: context as Required<Context>,
  defaultPreload: "intent",
  defaultViewTransition: false,
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;

function App() {
  const queryClient = useQueryClient();
  const [i18nReady, setI18nReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    return broadcastQueryClient(queryClient);
  }, [queryClient]);

  // Listen for boot errors (e.g. database setup failure) so the user sees
  // an error modal instead of a frozen/blank window.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("boot-error", (event) => {
      console.error("Boot error received:", event.payload);
      captureTelemetryMessage(`Boot error: ${event.payload}`, "fatal");
      setBootError(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // ✅ FIXED: Always call hooks unconditionally, then conditionally render
  const queryResults = useQueries({
    queries: [
      {
        queryKey: ["auth-user-id"],
        queryFn: () => authCommands.getFromStore("auth-user-id"),
        enabled: i18nReady, // Only run when i18n is ready
      },
      {
        queryKey: ["session", "onboarding", "id"],
        queryFn: () => dbCommands.onboardingSessionId(),
        enabled: i18nReady, // Only run when i18n is ready
      },
      {
        queryKey: ["session", "thank-you", "id"],
        queryFn: () => dbCommands.thankYouSessionId(),
        enabled: i18nReady, // Only run when i18n is ready
      },
    ],
  });

  // Initialize i18n BEFORE rendering anything with timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn("i18n initialization timeout, proceeding with fallback");
      setI18nReady(true);
    }, 2000); // 2s max wait

    loadUserLanguage()
      .then(() => {
        clearTimeout(timeout);
        setI18nReady(true);
      })
      .catch((error) => {
        console.error("Failed to load user language, falling back to default:", error);
        clearTimeout(timeout);
        setI18nReady(true);
      });

    // Initialize optional user request metadata (fire-and-forget)
    authCommands.getFromStore("auth-account-id").then((id) => setUserIdHeader(id)).catch(() => {});

    return () => clearTimeout(timeout);
  }, []);

  // ✅ Safe destructuring with fallback
  const [userId, onboardingSessionId, thankYouSessionId] = queryResults || [];

  useEffect(() => {
    if (userId?.data) {
      setTelemetryUser(userId.data);
    }
  }, [userId?.data]);

  // Show error modal if boot failed (e.g. database setup failure).
  // This must be checked before other early returns so the user always
  // sees the error instead of a blank screen.
  if (bootError) {
    return (
      <ErrorModal
        isOpen={true}
        onClose={() => {}}
        error={new Error(bootError)}
      />
    );
  }

  // Don't render until i18n is ready
  if (!i18nReady) {
    return null;
  }

  if (!userId.data || !onboardingSessionId.data || !thankYouSessionId.data) {
    return null;
  }

  return (
    <RouterProvider
      router={router}
      context={{
        ...context,
        userId: userId.data,
        onboardingSessionId: onboardingSessionId.data,
        thankYouSessionId: thankYouSessionId.data,
      }}
    />
  );
}

// No need to add a class since we're applying fonts directly in CSS

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <CatchBoundary getResetKey={() => "error"} errorComponent={ErrorComponent}>
      <TooltipProvider delayDuration={700} skipDelayDuration={300}>
        <ThemeProvider defaultTheme="light">
          <QueryClientProvider client={queryClient}>
            <I18nProvider i18n={i18n}>
              <App />
              <Toaster
                position="bottom-left"
                offset={16}
                duration={Infinity}
                swipeDirections={[]}
              />
            </I18nProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </TooltipProvider>
    </CatchBoundary>,
  );
}
