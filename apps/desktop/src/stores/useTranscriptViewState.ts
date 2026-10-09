import { create } from "zustand";

export interface TranscriptViewState {
  isSearchActive: boolean;
  searchTerm: string;
  replaceTerm: string;
}

export const DEFAULT_TRANSCRIPT_VIEW_STATE: TranscriptViewState = {
  isSearchActive: false,
  searchTerm: "",
  replaceTerm: "",
};

interface TranscriptViewStore {
  sessions: Record<string, TranscriptViewState>;
  getViewState: (sessionId: string) => TranscriptViewState;
  setViewState: (sessionId: string, updates: Partial<TranscriptViewState>) => void;
  clearSession: (sessionId: string) => void;
}

export const useTranscriptViewState = create<TranscriptViewStore>((set, get) => ({
  sessions: {},

  getViewState: (sessionId) => get().sessions[sessionId] ?? DEFAULT_TRANSCRIPT_VIEW_STATE,

  setViewState: (sessionId, updates) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...(state.sessions[sessionId] ?? DEFAULT_TRANSCRIPT_VIEW_STATE),
          ...updates,
        },
      },
    }));
  },

  clearSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _removed, ...remainingSessions } = state.sessions;
      return { sessions: remainingSessions };
    });
  },
}));
