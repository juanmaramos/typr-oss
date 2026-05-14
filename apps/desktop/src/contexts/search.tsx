import { createContext, useContext, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";

import { CommandPalette } from "@/components/command-palette";
import { debugWarnFor } from "@/components/utils/debug-logger";
import { createSearchStore, SearchStore } from "@/stores/search";
import { useTypr } from "./typr";

// Context for search store
const SearchContext = createContext<ReturnType<typeof createSearchStore> | null>(null);
const fallbackSearchStore = createSearchStore("");

// Context for command palette trigger (cleaner than global window object)
const CommandPaletteContext = createContext<() => void>(() => {});

export function SearchProvider({
  children,
  store,
}: {
  children: React.ReactNode;
  store?: SearchStore;
}) {
  const { userId } = useTypr();

  const storeRef = useRef<ReturnType<typeof createSearchStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = store || createSearchStore(userId);
  }

  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const openCommandPalette = () => setShowCommandPalette(true);

  // Only keep the essential hotkey - Cmd+K to open command palette
  useHotkeys(
    "mod+k",
    (event) => {
      event.preventDefault();
      setShowCommandPalette(true);
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <SearchContext.Provider value={storeRef.current}>
      <CommandPaletteContext.Provider value={openCommandPalette}>
        {children}
        <CommandPalette open={showCommandPalette} onOpenChange={setShowCommandPalette} />
      </CommandPaletteContext.Provider>
    </SearchContext.Provider>
  );
}

export function useTyprSearch<T>(
  selector: Parameters<typeof useStore<ReturnType<typeof createSearchStore>, T>>[1],
) {
  const store = useContext(SearchContext);

  if (!store) {
    // During HMR in development, provider might not be ready yet
    // Return a safe fallback from a temporary store instead of throwing
    debugWarnFor("DEBUG_SEARCH", "SearchDebug", "useTyprSearch called outside SearchProvider; using fallback store");
    return useStore(fallbackSearchStore, useShallow(selector));
  }

  return useStore(store, useShallow(selector));
}

// Clean hook to trigger command palette from any component
export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}
