import type { QueryClient } from "@tanstack/react-query";
import type { RegisteredRouter, RouteIds } from "@tanstack/react-router";

export * from "./tauri.gen";

import type { OngoingSessionStore, SessionsStore } from "@typr/utils/stores";

export type NangoIntegration = "google-calendar" | "outlook-calendar";

export type Context = {
  userId?: string;
  onboardingSessionId?: string;
  thankYouSessionId?: string;
  ongoingSessionStore: OngoingSessionStore;
  sessionsStore: SessionsStore;
  queryClient: QueryClient;
};

export type RoutePath = RouteIds<RegisteredRouter["routeTree"]>;

export type CalendarIntegration =
  | NangoIntegration
  | "apple-calendar";

export interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
}
