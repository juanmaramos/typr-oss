import { fetchUpdateCheck, installUpdate, resolveLatestUpdate } from "@/components/toast/use-check-for-updates";
import { useAppInfo } from "@/hooks/use-app-info";
import { Separator } from "@typr/ui/components/ui/separator";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getName } from "@tauri-apps/api/app";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Update } from "@tauri-apps/plugin-updater";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type UpdateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; update: Update }
  | { status: "installing"; update: Update; progress: number }
  | { status: "error" };

export default function About() {
  const appInfo = useAppInfo();
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>({ status: "idle" });
  const [sunGlint, setSunGlint] = useState(false);
  const appName = appInfo.data?.name ?? "Typr";
  const appVersion = appInfo.data?.version;

  const appInApplicationsFolder = useQuery({
    queryKey: ["app-in-applications-folder"],
    queryFn: async () => {
      const name = await getName();
      const path = await join("/Applications", `${name}.app`);
      return exists(path);
    },
  });

  const openExternal = (url: string) => {
    openUrl(url).catch(error => console.error("Failed to open URL:", error));
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const runGlint = () => {
      setSunGlint(true);
      timeoutId = setTimeout(() => setSunGlint(false), 900);
    };

    runGlint();

    const intervalId = window.setInterval(runGlint, 32000);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setUpdateCheck({ status: "checking" });

    try {
      const update = await fetchUpdateCheck();
      setUpdateCheck(update ? { status: "available", update } : { status: "up-to-date" });
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateCheck({ status: "error" });
    }
  };

  const handleInstallUpdate = async (update: Update) => {
    setUpdateCheck({ status: "installing", update, progress: 0 });

    try {
      const latestUpdate = await resolveLatestUpdate(update);
      setUpdateCheck({ status: "installing", update: latestUpdate, progress: 0 });

      await installUpdate(latestUpdate, {
        appInApplicationsFolder: appInApplicationsFolder.data === true,
        onProgress: (progress) => setUpdateCheck({ status: "installing", update: latestUpdate, progress }),
      });
    } catch (error) {
      console.error("Failed to install update:", error);
      setUpdateCheck({ status: "error" });
    }
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{appName}</h2>
          <div className="shrink-0 text-sm text-muted-foreground">
            {appVersion ? <Trans>Version {appVersion}</Trans> : <Trans>Version</Trans>}
          </div>
        </div>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          <Trans>AI notepad for meetings, notes, and follow-up work.</Trans>
        </p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          <Trans>Resources</Trans>
        </div>

        <div className="divide-y divide-border">
          <AboutResourceRow
            icon="ri-refresh-line"
            iconClassName={updateCheck.status === "checking" ? "animate-spin" : undefined}
            label={getUpdateCheckLabel(updateCheck)}
            description={getUpdateCheckDescription(updateCheck)}
            onClick={handleCheckForUpdates}
            disabled={updateCheck.status === "checking" || updateCheck.status === "installing"}
            action={updateCheck.status === "available" ? <Trans>Download</Trans> : undefined}
            onAction={updateCheck.status === "available" ? () => handleInstallUpdate(updateCheck.update) : undefined}
            onDismiss={["up-to-date", "available", "error"].includes(updateCheck.status)
              ? () => setUpdateCheck({ status: "idle" })
              : undefined}
            showChevron={false}
          />
          <AboutResourceRow
            icon="ri-file-list-3-line"
            label={<Trans>View Changelog</Trans>}
            description={<Trans>Read what changed in recent releases.</Trans>}
            onClick={() => openExternal("https://github.com/juanmaramos/typr-oss/releases")}
            external
          />
          <AboutResourceRow
            icon="ri-feedback-line"
            label={<Trans>Send Feedback</Trans>}
            description={<Trans>Share ideas, issues, and feature requests.</Trans>}
            onClick={() => openExternal("https://github.com/juanmaramos/typr-oss/issues")}
            external
          />
          <AboutResourceRow
            icon="ri-mail-line"
            label={<Trans>Contact Support</Trans>}
            description={<Trans>Open GitHub Issues.</Trans>}
            onClick={() => openExternal("https://github.com/juanmaramos/typr-oss/issues")}
            external
          />
        </div>
      </div>

      <Separator />

      <div className="text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          <i
            className={`ri-sun-fill text-sm text-amber-500/80 ${
              sunGlint ? "animate-[about-sun-glint_900ms_cubic-bezier(0.22,1,0.36,1)]" : ""
            }`}
            aria-hidden="true"
          />
          <span>
            <Trans>
              Created by{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => openExternal("https://www.linkedin.com/in/jmramos")}
              >
                Juan M. Ramos
              </button>{" "}
              in Malaga, Spain
            </Trans>
          </span>
        </p>
      </div>
    </section>
  );
}

function getUpdateCheckLabel(updateCheck: UpdateCheckState) {
  if (updateCheck.status === "available") {
    return <Trans>Update Available</Trans>;
  }

  if (updateCheck.status === "installing") {
    return <Trans>Installing Update</Trans>;
  }

  return <Trans>Check for Updates</Trans>;
}

function getUpdateCheckDescription(updateCheck: UpdateCheckState) {
  switch (updateCheck.status) {
    case "checking":
      return <Trans>Checking for a newer version...</Trans>;
    case "up-to-date":
      return <Trans>You're up to date.</Trans>;
    case "available":
      return <Trans>Version {updateCheck.update.version} is available.</Trans>;
    case "installing":
      return <Trans>Downloading update {updateCheck.progress}%.</Trans>;
    case "error":
      return <Trans>Could not check for updates. Try again.</Trans>;
    case "idle":
    default:
      return <Trans>See whether a newer version is available.</Trans>;
  }
}

function AboutResourceRow({
  icon,
  iconClassName,
  label,
  description,
  onClick,
  disabled = false,
  action,
  onAction,
  onDismiss,
  external = false,
  showChevron = true,
}: {
  icon: string;
  iconClassName?: string;
  label: ReactNode;
  description: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  action?: ReactNode;
  onAction?: () => void;
  onDismiss?: () => void;
  external?: boolean;
  showChevron?: boolean;
}) {
  const { t } = useLingui();

  return (
    <div className="group flex w-full items-center gap-3 py-3 text-left transition-colors">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        onClick={onClick}
        disabled={disabled}
      >
        <i
          className={`${icon} ${
            iconClassName ?? ""
          } text-base text-muted-foreground transition-colors group-hover:text-foreground`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
      </button>

      {action && onAction
        ? (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-400"
            onClick={onAction}
          >
            {action}
          </button>
        )
        : !showChevron
        ? null
        : (
          <i
            className={`${
              external ? "ri-external-link-line" : "ri-arrow-right-s-line"
            } text-sm text-muted-foreground transition-colors group-hover:text-foreground`}
            aria-hidden="true"
          />
        )}

      {onDismiss && (
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
          aria-label={t`Dismiss update status`}
          onClick={onDismiss}
        >
          <i className="ri-close-line text-sm" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
