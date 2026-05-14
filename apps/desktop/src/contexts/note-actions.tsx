import { createContext, useCallback, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface NoteActionsContextType {
  openActionsMenu: () => void;
}

const NoteActionsContext = createContext<NoteActionsContextType | null>(null);

export function NoteActionsProvider({ children }: { children: React.ReactNode }) {
  const openActionsMenu = useCallback(() => {
    try {
      // Find and click the actions menu trigger button
      const actionsMenuButton = document.querySelector("[data-testid=\"actions-menu-trigger\"], .ri-more-fill")
        ?.closest("button, [role=\"button\"]") as HTMLElement;

      if (actionsMenuButton) {
        console.log("Opening actions menu");
        actionsMenuButton.click();
      } else {
        console.log("Actions menu not found - may not be on a note page");
      }
    } catch (error) {
      console.error("Failed to open actions menu:", error);
    }
  }, []);

  // Cmd+Shift+. / Ctrl+Shift+. for actions menu
  useHotkeys(
    "mod+shift+period",
    (event) => {
      event.preventDefault();
      openActionsMenu();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <NoteActionsContext.Provider value={{ openActionsMenu }}>
      {children}
    </NoteActionsContext.Provider>
  );
}

export function useNoteActions() {
  const context = useContext(NoteActionsContext);
  if (!context) {
    throw new Error("useNoteActions must be used within NoteActionsProvider");
  }
  return context;
}
