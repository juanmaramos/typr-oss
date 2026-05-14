import { useQuery } from "@tanstack/react-query";
import { type as getOsType } from "@tauri-apps/plugin-os";

import { useCommandPalette } from "@/contexts/search";
import { cn } from "@typr/ui/lib/utils";
import { Trans } from "@lingui/react/macro";

export function TopArea() {
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });
  const openCommandPalette = useCommandPalette();

  return (
    <div className="flex flex-col bg-sidebar">
      <div
        data-tauri-drag-region
        className={cn(
          "min-h-11",
          osType.data === "macos" && "pl-[68px]",
        )}
      />
      <div className="px-2 pb-2 pt-1.5">
        <button
          onClick={openCommandPalette}
          className="flex h-7 w-full items-center gap-2 rounded-md border bg-surface-100 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-200"
        >
          <i className="ri-search-line text-sm" />
          <span className="flex-1 text-left">
            <Trans>Search notes...</Trans>
          </span>
          <kbd className="pointer-events-none text-[10px] font-medium text-muted-foreground/60">⌘K</kbd>
        </button>
      </div>
    </div>
  );
}
