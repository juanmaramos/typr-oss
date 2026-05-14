import { useLingui } from "@lingui/react/macro";
import {
  type ErrorRouteComponent,
  Link,
  type NotFoundError,
  type NotFoundRouteComponent,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { captureTelemetryException } from "@/utils/telemetry";
import { Button } from "@typr/ui/components/ui/button";
import { ErrorModal } from "./error-modal";

const NotFound = () => {
  const { t } = useLingui();

  return (
    <div className="flex flex-col items-center justify-center gap-2 min-h-screen h-full w-full">
      <p>{t`Oops! Nothing here.`}</p>
      <Link to="/app">
        <Button variant="outline">{t`Go to home`}</Button>
      </Link>
    </div>
  );
};

export const CatchNotFoundFallback = (_props: { error: NotFoundError }) => {
  return <NotFound />;
};

export const NotFoundComponent: NotFoundRouteComponent = (_props) => {
  return <NotFound />;
};

export const ErrorComponent: ErrorRouteComponent = ({ error, reset }) => {
  const { t } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(true);

  useEffect(() => {
    console.error("Error boundary caught:", error);

    // Enhanced error logging with more context
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: (error as any).cause, // TypeScript compatibility
      userAgent: navigator.userAgent,
      url: window.location.href,
    });

    // Try to capture with Sentry with additional context
    try {
      captureTelemetryException(error, {
        tags: {
          component: "ErrorComponent",
          location: window.location.pathname,
        },
        contexts: {
          browser: {
            name: navigator.userAgent,
          },
          page: {
            url: window.location.href,
          },
        },
      });
    } catch (e) {
      console.error("Failed to capture exception with Sentry:", e);

      // Fallback: try basic capture
      try {
        captureTelemetryException(error);
      } catch (e2) {
        console.error("Failed basic Sentry capture:", e2);
      }
    }
  }, [error]);

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Reset the error boundary to try again
    reset();
  };

  return (
    <>
      <div className="flex min-h-screen h-full w-full flex-col items-center justify-center gap-2 bg-background p-6">
        <p className="text-lg text-muted-foreground">
          {t`Please use the error dialog to refresh the application.`}
        </p>
      </div>

      <ErrorModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        error={error}
      />
    </>
  );
};
