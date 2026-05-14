import { create } from "zustand";

interface SelectionContextState {
  selectedText: string | null;
  selectionRange: { from: number; to: number } | null;
  sessionId: string | null;
  isProcessing: boolean;
  diffPreview: {
    original: string;
    edited: string;
    reasoning: string;
  } | null;
  setSelection: (text: string, range: { from: number; to: number }, sessionId: string) => void;
  clearSelection: () => void;
  setDiffPreview: (preview: SelectionContextState["diffPreview"]) => void;
  clearDiff: () => void;
  setProcessing: (processing: boolean) => void;
}

export const useSelectionContext = create<SelectionContextState>((set) => ({
  selectedText: null,
  selectionRange: null,
  sessionId: null,
  isProcessing: false,
  diffPreview: null,
  setSelection: (selectedText, selectionRange, sessionId) => {
    console.log("🎯 [SelectionContext] Setting selection:", {
      textLength: selectedText.length,
      range: selectionRange,
      sessionId,
    });
    set({ selectedText, selectionRange, sessionId });
  },
  clearSelection: () => {
    console.log("🎯 [SelectionContext] Clearing selection");
    set({ selectedText: null, selectionRange: null, sessionId: null, isProcessing: false });
  },
  setDiffPreview: (diffPreview) => set({ diffPreview, isProcessing: false }),
  clearDiff: () => set({ diffPreview: null }),
  setProcessing: (isProcessing) => set({ isProcessing }),
}));
