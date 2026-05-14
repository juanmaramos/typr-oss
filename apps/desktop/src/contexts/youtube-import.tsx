import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { YouTubeImportDialog } from "@/components/youtube-import-dialog";

interface YouTubeImportContextType {
  openYouTubeImport: () => void;
  closeYouTubeImport: () => void;
}

const YouTubeImportContext = createContext<YouTubeImportContextType | null>(null);

let openYouTubeImportDialog: () => void = () => {
  if (process.env.NODE_ENV === "development") {
    console.warn("[YouTubeImport] openYouTubeImport called before YouTubeImportProvider is mounted");
  }
};

let closeYouTubeImportDialog: () => void = () => {};

export function YouTubeImportProvider({ children }: { children: React.ReactNode }) {
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);

  const openYouTubeImport = useCallback(() => setShowYouTubeDialog(true), []);
  const closeYouTubeImport = useCallback(() => setShowYouTubeDialog(false), []);

  useEffect(() => {
    const previousOpen = openYouTubeImportDialog;
    const previousClose = closeYouTubeImportDialog;

    openYouTubeImportDialog = openYouTubeImport;
    closeYouTubeImportDialog = closeYouTubeImport;

    return () => {
      openYouTubeImportDialog = previousOpen;
      closeYouTubeImportDialog = previousClose;
    };
  }, [openYouTubeImport, closeYouTubeImport]);

  useHotkeys(
    "mod+shift+y",
    (event) => {
      event.preventDefault();
      openYouTubeImport();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <YouTubeImportContext.Provider value={{ openYouTubeImport, closeYouTubeImport }}>
      {children}
      <YouTubeImportDialog
        open={showYouTubeDialog}
        onOpenChange={setShowYouTubeDialog}
        autoEnhance={true}
      />
    </YouTubeImportContext.Provider>
  );
}

export function useYouTubeImport() {
  const context = useContext(YouTubeImportContext);
  if (!context) {
    return {
      openYouTubeImport: openYouTubeImportDialog,
      closeYouTubeImport: closeYouTubeImportDialog,
    };
  }
  return context;
}
