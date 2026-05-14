import { create } from "zustand";

export type AudioUploadProgress =
  | { status: "idle" }
  | {
    status: "processing";
    current: number;
    total: number;
    startedAt: number;
    sessionId: string;
    fileName: string;
    indeterminate?: boolean;
  }
  | { status: "done"; sessionId: string }
  | { status: "enhanced"; sessionId: string }
  | { status: "error"; sessionId: string; message: string };

interface AudioUploadStore {
  progress: AudioUploadProgress;
  setProgress: (progress: AudioUploadProgress) => void;
  isProcessing: () => boolean;
}

export const useAudioUploadStore = create<AudioUploadStore>((set, get) => ({
  progress: { status: "idle" },
  setProgress: (progress) => set({ progress }),
  isProcessing: () => get().progress.status === "processing",
}));
