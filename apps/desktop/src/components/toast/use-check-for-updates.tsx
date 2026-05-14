import { restartApp } from "@/utils/app-restart";
import { captureTelemetryException } from "@/utils/telemetry";
import { i18n } from "@lingui/core";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { message } from "@tauri-apps/plugin-dialog";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { useCallback } from "react";

import { toast } from "@typr/ui/components/ui/toast";

export const CHECK_FOR_UPDATE_QUERY_KEY = ["check-for-update"] as const;

export async function fetchUpdateCheck() {
  if (process.env.NODE_ENV === "production") {
    return check();
  }

  return null;
}

export async function resolveLatestUpdate(update: Update) {
  try {
    const latestUpdate = await fetchUpdateCheck();

    if (!latestUpdate?.available) {
      return update;
    }

    return compareVersions(latestUpdate.version, update.version) >= 0 ? latestUpdate : update;
  } catch (err) {
    console.error("Failed to refresh update before install:", err);
    captureTelemetryException(err);
    return update;
  }
}

function compareVersions(left: string, right: string) {
  const leftParts = toVersionParts(left);
  const rightParts = toVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function toVersionParts(version: string) {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .filter(Number.isFinite);
}

export async function installUpdate(
  update: Update,
  {
    appInApplicationsFolder,
    onProgress,
  }: {
    appInApplicationsFolder: boolean;
    onProgress?: (progress: number) => void;
  },
) {
  let totalDownloaded = 0;
  let contentLength: number | undefined;

  try {
    await update.downloadAndInstall((progressEvent: DownloadEvent) => {
      if (progressEvent.event === "Started") {
        totalDownloaded = 0;
        contentLength = progressEvent.data.contentLength;
        onProgress?.(0);
      } else if (progressEvent.event === "Progress") {
        totalDownloaded += progressEvent.data.chunkLength;
        const totalSize = contentLength || (50 * 1024 * 1024);
        const progressPercentage = Math.min(Math.round((totalDownloaded / totalSize) * 100), 99);
        onProgress?.(progressPercentage);
      } else if (progressEvent.event === "Finished") {
        onProgress?.(100);
      }
    });

    restartApp(i18n._("The app will now restart"), i18n._("Update installed"));
  } catch (err) {
    captureTelemetryException(err);

    if (!appInApplicationsFolder) {
      await message(i18n._("Please move the app to the Applications folder and try again"), {
        kind: "error",
        title: i18n._("Update installation failed"),
      });
    } else {
      await message(String(err), { kind: "error", title: i18n._("Update installation failed") });
    }

    throw err;
  }
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CHECK_FOR_UPDATE_QUERY_KEY });

    const result = await queryClient.fetchQuery({
      queryKey: CHECK_FOR_UPDATE_QUERY_KEY,
      queryFn: fetchUpdateCheck,
    });

    if (!result || !result.available) {
      toast({
        id: "up-to-date-notification",
        title: <Trans>You're up to date</Trans>,
        content: <Trans>You have the latest version of Typr</Trans>,
        dismissible: true,
        duration: 5000,
      });
    }

    return result;
  }, [queryClient]);
}
