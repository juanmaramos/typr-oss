import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isProfileAvatarChoice, type ProfileAvatarChoice } from "@/lib/profile-avatar";

interface ProfileAvatarState {
  avatars: Record<string, ProfileAvatarChoice>;
  setAvatar: (userId: string, choice: ProfileAvatarChoice) => void;
}

const storageKey = "typr-profile-avatars";

function savedAvatars(): Record<string, ProfileAvatarChoice> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (!saved || typeof saved !== "object" || !("state" in saved)) {
      return {};
    }
    const state = saved.state;
    if (!state || typeof state !== "object" || !("avatars" in state)) {
      return {};
    }
    if (!state.avatars || typeof state.avatars !== "object") {
      return {};
    }
    const avatars: Record<string, ProfileAvatarChoice> = {};
    for (const [id, choice] of Object.entries(state.avatars)) {
      if (isProfileAvatarChoice(choice)) {
        avatars[id] = choice;
      }
    }
    return avatars;
  } catch {
    return {};
  }
}

// Avatar choice is a local UI preference, scoped to the active profile.
export const useProfileAvatarStore = create<ProfileAvatarState>()(persist(
  (set) => ({
    avatars: {},
    setAvatar: (userId, choice) => {
      if (!userId) {
        return;
      }
      // Read the latest map before writing, even if this window missed a storage event.
      const saved = savedAvatars();
      set(state => ({ avatars: { ...state.avatars, ...saved, [userId]: choice } }));
    },
  }),
  {
    name: storageKey,
    storage: createJSONStorage(() => window.localStorage),
    partialize: state => ({ avatars: state.avatars }),
  },
));

export function useProfileAvatarChoice(userId: string) {
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === storageKey || event.key === null)) {
        void useProfileAvatarStore.persist.rehydrate();
      }
    };
    const rehydrate = () => {
      void useProfileAvatarStore.persist.rehydrate();
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", rehydrate);
    rehydrate();
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", rehydrate);
    };
  }, []);

  const saved = useProfileAvatarStore(state => state.avatars?.[userId]);
  return isProfileAvatarChoice(saved) ? saved : "initials";
}
