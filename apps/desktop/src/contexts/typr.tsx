import { useQueries } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { commands as authCommands } from "@typr/plugin-auth";
import { commands as dbCommands } from "@typr/plugin-db";

export interface TyprContext {
  userId: string;
  onboardingSessionId: string;
  thankYouSessionId: string;
}

const TyprContext = createContext<TyprContext | null>(null);

export function TyprProvider({ children }: { children: React.ReactNode }) {
  const queryResults = useQueries({
    queries: [
      {
        queryKey: ["auth-user-id"],
        queryFn: () => authCommands.getFromStore("auth-user-id"),
      },
      {
        queryKey: ["session", "onboarding", "id"],
        queryFn: () => dbCommands.onboardingSessionId(),
      },
      {
        queryKey: ["session", "thank-you", "id"],
        queryFn: () => dbCommands.thankYouSessionId(),
      },
    ],
  });

  // ✅ Safe destructuring with fallback to prevent "useTypr must be used within a TyprProvider" error
  const [userId, onboardingSessionId, thankYouSessionId] = queryResults || [];

  const hasError = userId?.status === "error" || onboardingSessionId?.status === "error"
    || thankYouSessionId?.status === "error";

  if (hasError) {
    console.error("TyprProvider query errors:", userId?.error, onboardingSessionId?.error, thankYouSessionId?.error);
  }

  const hasData = userId?.data && onboardingSessionId?.data && thankYouSessionId?.data;

  const fallbackContext: TyprContext = {
    userId: "",
    onboardingSessionId: "",
    thankYouSessionId: "",
  };

  // Keep children mounted while queries resolve and provide safe fallback values.
  return (
    <TyprContext.Provider
      value={hasData
        ? {
          userId: userId.data!,
          onboardingSessionId: onboardingSessionId.data!,
          thankYouSessionId: thankYouSessionId.data!,
        }
        : fallbackContext}
    >
      {children}
    </TyprContext.Provider>
  );
}

export function useTypr() {
  const context = useContext(TyprContext);
  if (!context) {
    throw new Error("useTypr must be used within a TyprProvider");
  }
  return context;
}
