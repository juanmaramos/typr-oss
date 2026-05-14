import type { Tab } from "@/components/settings/components/types";
import type { AISettingsSection, SettingsDialogAction } from "@/contexts/settings-dialog";

/**
 * Opens the settings dialog by dispatching a custom event.
 * This avoids navigation issues and window management complexity.
 */
export async function openSettingsWindow(pathWithQuery = "/app/settings") {
  const url = new URL(pathWithQuery, "tauri://localhost");
  const tab = (url.searchParams.get("tab") ?? "general") as Tab;
  const action = url.searchParams.get("action") as SettingsDialogAction | null;
  const aiSection = url.searchParams.get("section") as AISettingsSection | null;

  // Dispatch event that the settings dialog context will listen for
  window.dispatchEvent(
    new CustomEvent("open-settings-dialog", { detail: { tab, action, aiSection } }),
  );
}
