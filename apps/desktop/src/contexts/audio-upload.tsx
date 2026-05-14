import React, { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { AudioUploadDialog } from "@/components/audio-upload-dialog";
import { AudioUploadToastObserver } from "@/components/audio-upload-toast";

// Module-level singleton — avoids React context identity issues entirely.
// The provider registers its setter on mount; all callers invoke the same stable fn.
let _openFn: (sessionId?: string) => void = () => {
  if (process.env.NODE_ENV === "development") {
    console.warn("[AudioUpload] openAudioUpload called before AudioUploadProvider is mounted");
  }
};

const openAudioUpload = (sessionId?: string) => _openFn(sessionId);

export function useAudioUpload() {
  return { openAudioUpload };
}

export function AudioUploadProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<{ open: boolean; sessionId?: string }>({
    open: false,
  });

  useEffect(() => {
    const prev = _openFn;
    _openFn = (sessionId) => setDialogState({ open: true, sessionId });
    return () => {
      _openFn = prev;
    };
  }, []);

  useHotkeys("mod+shift+u", (e) => {
    e.preventDefault();
    openAudioUpload();
  }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
  });

  return (
    <>
      {children}
      <AudioUploadDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ ...prev, open }))}
        sessionId={dialogState.sessionId}
      />
      <AudioUploadToastObserver />
    </>
  );
}
