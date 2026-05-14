import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { beginNewNoteTrace, markNewNoteTrace } from "@/utils/new-note-debug";

interface NewNoteContextType {
  createNewNote: (source?: string) => void;
}

const NewNoteContext = createContext<NewNoteContextType | null>(null);

export function NewNoteProvider({ children }: { children: React.ReactNode }) {
  const { navigate } = useRouter();

  const createNewNote = useCallback((source = "unknown") => {
    beginNewNoteTrace(source);
    markNewNoteTrace("navigate:/app/new");

    const startedAt = performance.now();

    navigate({ to: "/app/new" })
      .then(() => {
        markNewNoteTrace("navigate:/app/new:done", {
          ms: Math.round((performance.now() - startedAt) * 10) / 10,
        });
      })
      .catch((error) => {
        markNewNoteTrace("navigate:/app/new:error", {
          ms: Math.round((performance.now() - startedAt) * 10) / 10,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [navigate]);

  useHotkeys(
    "mod+n",
    (event) => {
      event.preventDefault();
      createNewNote("hotkey");
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <NewNoteContext.Provider value={{ createNewNote }}>
      {children}
    </NewNoteContext.Provider>
  );
}

export function useNewNote() {
  const context = useContext(NewNoteContext);
  if (!context) {
    throw new Error("useNewNote must be used within NewNoteProvider");
  }
  return context;
}
