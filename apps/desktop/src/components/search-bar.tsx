import { useLingui } from "@lingui/react/macro";

import clsx from "clsx";
import { SearchIcon } from "lucide-react";

import { useCommandPalette } from "@/contexts/search";
import { ShortcutById } from "./shortcut-by-id";

export function SearchBar() {
  const { t } = useLingui();
  const openCommandPalette = useCommandPalette();

  return (
    <div className="relative">
      {/* Simple search trigger - opens command palette */}
      <div
        className={clsx([
          "w-64 flex items-center gap-2 h-[28px] cursor-pointer",
          "text-muted-foreground hover:text-muted-foreground",
          "rounded-lg px-3 py-2",
          "bg-surface-400/80 hover:bg-surface-400/90",
          "transition-all duration-200 ease-out",
          "backdrop-blur-sm",
        ])}
        onClick={openCommandPalette}
      >
        <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {t`Find notes and actions...`}
        </span>
        <ShortcutById shortcutId="open-search" />
      </div>

      {
        /* TODO: Add back tag filtering UI when tags feature is implemented
          - Tag selector dropdown
          - Selected tags display with remove buttons
          - Clear all tags button
      */
      }

      {
        /* TODO: Add back search history dropdown when needed
          - Recent searches list
          - Clear history functionality
          - Click to search again
      */
      }
    </div>
  );
}
