import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { Button } from "@typr/ui/components/ui/button";

export function DataPathBlock() {
  const { t } = useLingui();
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { appDataDir, sep } = await import("@tauri-apps/api/path");
        const dir = await appDataDir();
        const separator = sep();
        setDbPath(`${dir}db.sqlite`.replace(/[/\\]+/g, separator));
      } catch {
        // dev/test environment
      }
    })();
  }, []);

  const handleCopyPath = async () => {
    if (!dbPath) {
      return;
    }
    try {
      await navigator.clipboard.writeText(dbPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy path:", error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      const { appDataDir } = await import("@tauri-apps/api/path");
      const dataPath = await appDataDir();
      await openPath(dataPath);
    } catch (error) {
      console.error("Failed to open notes folder:", error);
    }
  };

  if (!dbPath) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
        <code className="flex-1 truncate text-xs text-muted-foreground">{dbPath}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label={t`Copy database path`}
          onClick={handleCopyPath}
        >
          <i className={`${copied ? "ri-check-line text-green-500" : "ri-file-copy-line"} text-sm`} />
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleOpenFolder}
      >
        <i className="ri-folder-line text-sm mr-2" />
        <Trans>Open folder</Trans>
      </Button>
    </div>
  );
}
