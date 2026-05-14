import { FEATURES } from "@/lib/features";
import { create } from "zustand";

export type FloatingVariant = "rail" | "dock";

const STORAGE_KEY = "feature-flag:floating-variant";
// The rail variant is quarantined after the UX test. Keep it reachable
// only when the explicit feature flag is enabled in development.
export const canSwitchFloatingVariant = import.meta.env.DEV && FEATURES.ENABLE_LEGACY_FLOATING_RAIL_VARIANT;

function getStoredVariant(): FloatingVariant {
  if (!canSwitchFloatingVariant) {
    return "dock";
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "rail" || stored === "dock") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "dock";
}

export const useFeatureFlags = create<{
  floatingVariant: FloatingVariant;
  setFloatingVariant: (variant: FloatingVariant) => void;
  toggleFloatingVariant: () => void;
}>((set, get) => ({
  floatingVariant: getStoredVariant(),
  setFloatingVariant: (variant) => {
    if (!canSwitchFloatingVariant) {
      set({ floatingVariant: "dock" });
      return;
    }

    localStorage.setItem(STORAGE_KEY, variant);
    set({ floatingVariant: variant });
  },
  toggleFloatingVariant: () => {
    if (!canSwitchFloatingVariant) {
      set({ floatingVariant: "dock" });
      return;
    }

    const next = get().floatingVariant === "rail" ? "dock" : "rail";
    localStorage.setItem(STORAGE_KEY, next);
    set({ floatingVariant: next });
  },
}));
