import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getName } from "@tauri-apps/api/app";
import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";

import { sonnerToast, toast } from "@typr/ui/components/ui/toast";
import { DownloadProgress } from "./shared";
import {
  CHECK_FOR_UPDATE_QUERY_KEY,
  fetchUpdateCheck,
  installUpdate,
  resolveLatestUpdate,
  useCheckForUpdates,
} from "./use-check-for-updates";

export default function OtaNotification() {
  const checkForUpdates = useCheckForUpdates();

  const appInApplicationsFolder = useQuery({
    queryKey: ["app-in-applications-folder"],
    queryFn: async () => {
      const name = await getName();
      const path = await join("/Applications", `${name}.app`);
      return exists(path);
    },
  });

  const checkForUpdate = useQuery({
    queryKey: CHECK_FOR_UPDATE_QUERY_KEY,
    queryFn: fetchUpdateCheck,
    refetchInterval: 1000 * 60 * 60 * 12, // Check every 12 hours
    refetchIntervalInBackground: true,
  });

  // Listen for manual update check trigger from menu
  useEffect(() => {
    const unlisten = listen("check-for-updates", async () => {
      await checkForUpdates();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkForUpdates]);

  useEffect(() => {
    if (!checkForUpdate.data) {
      return;
    }

    const update = checkForUpdate.data;

    toast({
      id: "ota-notification",
      title: <Trans>Update available</Trans>,
      content: <Trans>Version {update.version} is available to install</Trans>,
      buttons: [
        {
          label: <Trans>Update now</Trans>,
          onClick: async () => {
            sonnerToast.dismiss("ota-notification");

            const latestUpdate = await resolveLatestUpdate(update);
            const updateChannel = new Channel<number>();

            toast({
              id: "update-download",
              title: <Trans>Downloading update {latestUpdate.version}</Trans>,
              content: (
                <div className="space-y-1">
                  <div>
                    <Trans>This might take a few minutes depending on your Internet speed</Trans>
                  </div>
                  <DownloadProgress channel={updateChannel} />
                </div>
              ),
              dismissible: false,
            });

            await installUpdate(latestUpdate, {
              appInApplicationsFolder: appInApplicationsFolder.data === true,
              onProgress: (progress) => updateChannel.onmessage(progress),
            });
          },
          primary: true,
        },
      ],
      dismissible: true,
    });
  }, [appInApplicationsFolder.data, checkForUpdate.data]);

  return null;
}
