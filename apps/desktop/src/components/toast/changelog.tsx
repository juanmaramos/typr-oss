import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";

import { openURL } from "@/utils/shell";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";

const LAST_SEEN_VERSION_KEY = "typr-last-seen-version";

export default function ChangelogNotification() {
  const currentVersion = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => {
      return await getVersion();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!currentVersion.data) {
      return;
    }

    const lastSeenVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    const current = currentVersion.data;

    // Only show changelog for actual version changes, not first-time users
    if (lastSeenVersion && lastSeenVersion !== current) {
      showChangelogToast(current, lastSeenVersion);
    }

    // Track current version to detect future updates
    localStorage.setItem(LAST_SEEN_VERSION_KEY, current);
  }, [currentVersion.data]);

  return null;
}

function showChangelogToast(newVersion: string, previousVersion: string) {
  toast({
    id: "changelog-notification",
    title: <Trans>Welcome to Typr {newVersion}</Trans>,
    content: (
      <div className="space-y-2">
        <p className="text-sm">
          <Trans>Check out what's new in this release</Trans>
        </p>
      </div>
    ),
    buttons: [
      {
        label: <Trans>View changelog</Trans>,
        onClick: async () => {
          sonnerToast.dismiss("changelog-notification");
          try {
            await openURL("https://github.com/juanmaramos/typr-oss/releases");
          } catch (error) {
            console.error("Failed to open changelog:", error);
          }
        },
        primary: true,
      },
      {
        label: <Trans>Dismiss</Trans>,
        onClick: () => {
          sonnerToast.dismiss("changelog-notification");
        },
      },
    ],
    dismissible: true,
  });
}
