// react-scan must be imported before React
import { scan } from "react-scan";

import { useQuery } from "@tanstack/react-query";
import { CatchNotFound, createRootRouteWithContext, Outlet, useNavigate } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { lazy, Suspense, useEffect } from "react";

import { CatchNotFoundFallback, ErrorComponent, NotFoundComponent } from "@/components/control";
import { TyprProvider } from "@/contexts";
import type { Context } from "@/types";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { events as windowsEvents, init as windowsInit } from "@typr/plugin-windows";

// Create a wrapped error component that's inside a TyprProvider
const WrappedErrorComponent: React.ComponentType<{ error: Error }> = ({ error }) => (
  <TyprProvider>
    <ErrorComponent error={error} reset={() => window.location.reload()} />
  </TyprProvider>
);

export const Route = createRootRouteWithContext<Required<Context>>()({
  component: Component,
  errorComponent: WrappedErrorComponent,
  notFoundComponent: NotFoundComponent,
});

const POSITION = "bottom-right";

declare global {
  interface Window {
    __TYPR_NAVIGATE__?: (to: string) => void;
  }
}

function Component() {
  const navigate = useNavigate();

  const showDevtools = useQuery({
    queryKey: ["showDevtools"],
    queryFn: () => {
      const flag = (window as any).TANSTACK_DEVTOOLS;
      return (flag ?? false);
    },
    enabled: process.env.NODE_ENV !== "production",
    refetchInterval: 30000, // Reduced from 1s to 30s - dev tools flag doesn't need frequent checking
  });

  useEffect(() => {
    window.__TYPR_NAVIGATE__ = (to: string) => {
      navigate({ to });
    };

    return () => {
      window.__TYPR_NAVIGATE__ = undefined;
    };
  }, [navigate]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const webview = getCurrentWebviewWindow();
    windowsEvents.navigate(webview).listen(({ payload }) => {
      navigate({ to: payload.path, search: payload.search ?? undefined });
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "__root.navigate.listener.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register navigate listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "__root.navigate.listener");
    };
  }, [navigate]);

  useEffect(() => {
    windowsInit();
    scan({ enabled: false });
  }, []);

  // Listen for debug events from control window
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<string>("debug", (event) => {
      // Control debug event received (removed verbose logging)
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "__root.debug.listener.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register debug listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "__root.debug.listener");
    };
  }, []);

  return (
    <TyprProvider>
      <CatchNotFound fallback={(e) => <CatchNotFoundFallback error={e} />}>
        <Outlet />
      </CatchNotFound>
      {showDevtools.data && (
        <Suspense>
          <TanStackRouterDevtools position={POSITION} initialIsOpen={false} />
          <TanStackQueryDevtools
            buttonPosition={POSITION}
            position="bottom"
            initialIsOpen={false}
          />
        </Suspense>
      )}
    </TyprProvider>
  );
}

const TanStackRouterDevtools = process.env.NODE_ENV === "production"
  ? () => null
  : lazy(() =>
    import("@tanstack/react-router-devtools").then((res) => ({
      default: (
        props: React.ComponentProps<typeof res.TanStackRouterDevtools>,
      ) => <res.TanStackRouterDevtools {...props} />,
    }))
  );

const TanStackQueryDevtools = process.env.NODE_ENV === "production"
  ? () => null
  : lazy(() =>
    import("@tanstack/react-query-devtools").then((res) => ({
      default: (
        props: React.ComponentProps<typeof res.ReactQueryDevtools>,
      ) => <res.ReactQueryDevtools {...props} />,
    }))
  );
