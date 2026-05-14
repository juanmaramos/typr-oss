export * from "./bindings.gen";

import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type UUID = `${string}-${string}-${string}-${string}-${string}`;

export type WindowLabel =
  | "main"
  | `note-${UUID}`
  | "calendar"
  | "settings"
  | "finder"
  | "control"
  | "transcription-status";

export const getCurrentWebviewWindowLabel = (): WindowLabel | null => {
  try {
    const window = getCurrentWebviewWindow();
    if (!window) {
      console.warn("⚠️ getCurrentWebviewWindow() returned undefined - window not yet initialized");
      return null;
    }
    return window.label as WindowLabel;
  } catch (error) {
    // During very early initialization or HMR, Tauri's internal metadata might not be ready
    console.warn("⚠️ Failed to get webview window label (Tauri not initialized yet):", error);
    return null;
  }
};

export const init = () => {
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
};
