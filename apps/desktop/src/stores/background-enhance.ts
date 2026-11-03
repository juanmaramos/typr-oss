import { create } from "zustand";

type BackgroundEnhancePhase = "starting" | "streaming" | "finishing";

interface BackgroundEnhanceStore {
  phases: Partial<Record<string, BackgroundEnhancePhase>>;
  setPhase: (sessionId: string, phase: BackgroundEnhancePhase) => void;
  clear: (sessionId: string) => void;
}

// Transient UI state only; needs_enhance in the database owns durable work/retries.
export const useBackgroundEnhanceStore = create<BackgroundEnhanceStore>((set) => ({
  phases: {},
  setPhase: (sessionId, phase) => set((state) => state.phases[sessionId] === phase
    ? state
    : { phases: { ...state.phases, [sessionId]: phase } }),
  clear: (sessionId) => set((state) => {
    const phases = { ...state.phases };
    delete phases[sessionId];
    return { phases };
  }),
}));
