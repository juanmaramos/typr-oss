import { useLocation } from "@tanstack/react-router";

export type ShellMode = "notes" | "ask" | "projects";

export function useShellMode(): ShellMode {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname.startsWith("/app/projects") || pathname.startsWith("/app/spaces")) {
    return "projects";
  }

  if (pathname.startsWith("/app/ask")) {
    return "ask";
  }

  return "notes";
}
