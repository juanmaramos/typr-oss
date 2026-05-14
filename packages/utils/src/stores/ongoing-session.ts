import { create as mutate } from "mutative";
import { createStore } from "zustand";

import { commands as listenerCommands, events as listenerEvents } from "@typr/plugin-listener";
import { createSessionsStore } from "./sessions";

type State = {
  sessionId: string | null;
  sessionEventUnlisten?: () => void;
  loading: boolean;
  status: "inactive" | "running_active" | "running_paused";
  amplitude: { mic: number; speaker: number };
  enhanceController: AbortController | null; // Keep for backward compatibility
  micMuted: boolean;
  speakerMuted: boolean;
  autoEnhanceTemplate: string | null;
};

type Actions = {
  get: () => State & Actions;
  setEnhanceController: (controller: AbortController | null) => void;
  setAutoEnhanceTemplate: (templateId: string | null) => void;
  start: (sessionId: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
};

const initialState: State = {
  sessionId: null,
  status: "inactive",
  loading: false,
  amplitude: { mic: 0, speaker: 0 },
  enhanceController: null, // Keep for backward compatibility
  micMuted: false,
  speakerMuted: false,
  autoEnhanceTemplate: null,
};

export type OngoingSessionStore = ReturnType<typeof createOngoingSessionStore>;

type OngoingSessionCallbacks = {
  onRecordingStartFailed?: (error: any) => void;
};

export const createOngoingSessionStore = (
  sessionsStore: ReturnType<typeof createSessionsStore>,
  callbacks?: OngoingSessionCallbacks,
) => {
  const store = createStore<State & Actions>((set, get) => ({
    ...initialState,
    get: () => get(),

    setEnhanceController: (controller: AbortController | null) => {
      set((state) =>
        mutate(state, (draft) => {
          draft.enhanceController = controller;
        })
      );
    },
    setAutoEnhanceTemplate: (templateId: string | null) => {
      set((state) =>
        mutate(state, (draft) => {
          draft.autoEnhanceTemplate = templateId;
        })
      );
    },

    start: (sessionId: string) => {
      if (!sessionId) {
        console.error("Cannot start session: empty sessionId");
        return;
      }

      const currentStatus = get().status;
      if (currentStatus !== "inactive") {
        console.warn("Cannot start session: already in state", currentStatus);
        return;
      }

      const sessionStore = sessionsStore.getState().sessions[sessionId];
      if (!sessionStore) {
        console.error("Cannot start session: session not found in store", sessionId);
        return;
      }

      set((state) =>
        mutate(state, (draft) => {
          draft.sessionId = sessionId;
          draft.loading = true;
        })
      );

      const currentSession = sessionStore.getState().session;

      sessionStore.getState().persistSession(undefined, true);

      if (currentSession.raw_memo_html && currentSession.raw_memo_html != "<p></p>") {
        const preMeetingNote = currentSession.raw_memo_html;
        sessionStore.getState().updatePreMeetingNote(preMeetingNote);
      }

      // Wrap in try-catch in case Tauri event system isn't initialized yet
      try {
        listenerEvents.sessionEvent.listen(({ payload }) => {
          if (payload.type === "audioAmplitude") {
            set((state) =>
              mutate(state, (draft) => {
                draft.amplitude = {
                  mic: payload.mic,
                  speaker: payload.speaker,
                };
              })
            );
          } else if (payload.type === "running_active") {
            set((state) =>
              mutate(state, (draft) => {
                draft.status = "running_active";
                draft.loading = false;
              })
            );
          } else if (payload.type === "running_paused") {
            const currentSessionId = get().sessionId;
            set((state) =>
              mutate(state, (draft) => {
                draft.status = "running_paused";
                draft.loading = false;
              })
            );
            // Refresh session after pause completes
            if (currentSessionId) {
              const sessionStore = sessionsStore.getState().sessions[currentSessionId];
              sessionStore?.getState().refresh();
            }
          } else if (payload.type === "inactive") {
            const currentSessionId = get().sessionId;
            const currentUnlisten = get().sessionEventUnlisten;
            // Full cleanup: this is the single source of truth for stop transitions.
            // sessionId must be nulled here so the timer resets immediately.
            // Note: autoEnhanceTemplate is NOT cleared here — the useAutoEnhance
            // hook reads it during this same render cycle and clears it after use.
            set((state) =>
              mutate(state, (draft) => {
                draft.status = "inactive";
                draft.loading = false;
                draft.sessionId = null;
                draft.amplitude = { mic: 0, speaker: 0 };
                draft.enhanceController = null;
                draft.sessionEventUnlisten = undefined;
              })
            );
            // Unlisten from session events now that the session is fully stopped
            if (currentUnlisten) {
              currentUnlisten();
            }
            // Refresh session after stop completes
            if (currentSessionId) {
              const sessionStore = sessionsStore.getState().sessions[currentSessionId];
              sessionStore?.getState().refresh();
            }
          } else if (payload.type === "micMuted") {
            set((state) =>
              mutate(state, (draft) => {
                draft.micMuted = payload.value;
              })
            );
          } else if (payload.type === "speakerMuted") {
            set((state) =>
              mutate(state, (draft) => {
                draft.speakerMuted = payload.value;
              })
            );
          }
        }).then((unlisten) => {
          set((state) =>
            mutate(state, (draft) => {
              draft.sessionEventUnlisten = unlisten;
            })
          );
        });
      } catch (error) {
        console.warn("⚠️ Failed to set up session event listener (Tauri not ready yet):", error);
      }

      // Sync microphone device state before starting recording to prevent stale UI cache issues
      listenerCommands.getCurrentMicrophoneDevice().then((currentDevice) => {
        // Now start the session with synchronized device state
        listenerCommands.startSession(sessionId).then(() => {
          set({ status: "running_active", loading: false });
        }).catch((error) => {
          console.error(error);
          set(initialState);

          // Notify user about recording failure
          if (callbacks?.onRecordingStartFailed) {
            callbacks.onRecordingStartFailed(error);
          }
        });
      }).catch((error) => {
        console.error("🎤 [Recording] Device sync failed, proceeding anyway:", error);

        // Fallback: proceed with recording start even if device sync fails
        listenerCommands.startSession(sessionId).then(() => {
          set({ status: "running_active", loading: false });
        }).catch((error) => {
          console.error(error);
          set(initialState);

          // Notify user about recording failure
          if (callbacks?.onRecordingStartFailed) {
            callbacks.onRecordingStartFailed(error);
          }
        });
      });
    },
    stop: () => {
      set((state) =>
        mutate(state, (draft) => {
          draft.loading = true;
        })
      );

      // State cleanup is handled by the "inactive" event listener.
      // Do NOT call set(initialState) here — it races with the event
      // and causes intermediate states where sessionId is still set
      // but status is already "inactive" (triggering timer/enhance bugs).
      listenerCommands.stopSession().catch((error) => {
        console.error("Failed to stop session:", error);
        set((state) =>
          mutate(state, (draft) => {
            draft.loading = false;
          })
        );
      });
    },
    pause: () => {
      set((state) =>
        mutate(state, (draft) => {
          draft.loading = true;
        })
      );

      listenerCommands.pauseSession().then(() => {
        set((state) =>
          mutate(state, (draft) => {
            draft.status = "running_paused";
            draft.loading = false;
          })
        );
        // Session refresh is handled by the "running_paused" event listener
      }).catch((error) => {
        console.error("Failed to pause session:", error);
        set((state) =>
          mutate(state, (draft) => {
            draft.loading = false;
          })
        );
      });
    },
    resume: () => {
      set((state) =>
        mutate(state, (draft) => {
          draft.loading = true;
        })
      );

      listenerCommands.resumeSession().then(() => {
        set((state) =>
          mutate(state, (draft) => {
            draft.status = "running_active";
            draft.loading = false;
          })
        );
      }).catch((error) => {
        console.error("❌ Failed to resume session:", error);
        set((state) =>
          mutate(state, (draft) => {
            draft.loading = false;
          })
        );
      });
    },
  }));

  // SIMPLE FIX: Set up persistent mute event listeners
  // Wrap in try-catch in case Tauri event system isn't initialized yet
  try {
    listenerEvents.sessionEvent.listen(({ payload }) => {
      if (payload.type === "micMuted") {
        store.setState((state) =>
          mutate(state, (draft) => {
            draft.micMuted = payload.value;
          })
        );
      } else if (payload.type === "speakerMuted") {
        store.setState((state) =>
          mutate(state, (draft) => {
            draft.speakerMuted = payload.value;
          })
        );
      }
    });
  } catch (error) {
    console.warn("⚠️ Failed to set up mute event listener (Tauri not ready yet):", error);
  }

  return store;
};
