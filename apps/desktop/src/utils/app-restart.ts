import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Reusable app restart utility - originally used for OTA updates,
 * now also used for language changes and other cases requiring full restart
 */
export async function restartApp(reason: string, title: string = "Restart Required") {
  await message(reason, {
    kind: "info",
    title: title,
    okLabel: "OK",
  });

  // Use same delay pattern as OTA updates for consistency
  setTimeout(relaunch, 2000);
}

/**
 * Language-specific restart with proper messaging
 */
export async function restartForLanguageChange(newLanguage: string) {
  const languageNames: Record<string, string> = {
    "en": "English",
    "es": "Español",
  };

  const langName = languageNames[newLanguage] || newLanguage;

  await restartApp(
    `Language changed to ${langName}. The app will restart to apply changes.`,
    "Language Changed",
  );
}
