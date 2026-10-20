import { create as mutate } from "mutative";
import { createStore } from "zustand";

import { commands as dbCommands, type Session, type SessionNoteUpdate } from "@typr/plugin-db";
import pDebounce from "p-debounce";

type State = {
  session: Session;
  showRaw: boolean;
};

type Actions = {
  get: () => State & Actions;
  refresh: () => Promise<void>;
  setShowRaw: (showRaw: boolean) => void;
  updateTitle: (title: string) => void;
  updatePreMeetingNote: (note: string) => void;
  updateRawNote: (note: string) => void;
  updateEnhancedNote: (note: string) => void;
  restoreEnhancedNote: (note: string | null, showRaw?: boolean) => Promise<void>;
  snapshotAutoEnhanced: (note: string) => void;
  restoreAutoEnhanced: () => string | null;
  persistSession: (session?: Session, force?: boolean) => Promise<void>;
};

export type SessionStoreOptions = {
  onSessionPersisted?: (session: Session) => void | Promise<void>;
};

export type SessionStore = ReturnType<typeof createSessionStore>;

export const createSessionStore = (session: Session, options: SessionStoreOptions = {}) => {
  const pendingUpdates = new Map<SessionNoteUpdate["field"], SessionNoteUpdate>();
  let writes = Promise.resolve();

  const notifySessionPersisted = (session: Session) => {
    if (!options.onSessionPersisted) {
      return;
    }

    void Promise.resolve(options.onSessionPersisted(session)).catch((error) => {
      console.warn("[session-store] onSessionPersisted failed", error);
    });
  };

  const flushUpdates = () => {
    const queuedUpdates = [...pendingUpdates.values()];
    if (queuedUpdates.length === 0) {
      return writes;
    }

    const write = writes.then(async () => {
      // Earlier serialized writes may already have acknowledged this snapshot.
      const updates = queuedUpdates.filter((update) => pendingUpdates.get(update.field) === update);
      if (updates.length === 0) return;
      const persisted = await dbCommands.updateSessionNoteFields(session.id, updates);
      for (const update of updates) {
        // An earlier acknowledgement must not clear a newer edit to this field.
        if (pendingUpdates.get(update.field) === update) {
          pendingUpdates.delete(update.field);
        }
      }
      if (persisted) {
        notifySessionPersisted(persisted);
      }
    });
    // A failed write must not block subsequent edits.
    writes = write.catch(() => {});
    return write;
  };
  const debouncedFlush = pDebounce(flushUpdates, 50);

  return createStore<State & Actions>((set, get) => ({
    session,
    showRaw: !session.enhanced_memo_html,
    get,
    refresh: async () => {
      const { session: { id } } = get();
      const session = await dbCommands.getSession({ id });
      if (session) {
        set({ session });
      }
    },
    setShowRaw: (showRaw: boolean) => {
      set((state) =>
        mutate(state, (draft) => {
          draft.showRaw = showRaw;
        })
      );
    },
    updateTitle: (title: string) => {
      set((state) => {
        const next = mutate(state, (draft) => {
          draft.session.title = title;
        });
        get().persistSession(next.session);
        return next;
      });
    },
    updatePreMeetingNote: (note: string) => {
      set((state) => {
        const next = mutate(state, (draft) => {
          draft.session.pre_meeting_memo_html = note;
        });
        get().persistSession(next.session);
        return next;
      });
    },
    updateRawNote: (note: string) => {
      set((state) => {
        const next = mutate(state, (draft) => {
          draft.session.raw_memo_html = note;
        });
        get().persistSession(next.session);
        return next;
      });
    },
    updateEnhancedNote: (note: string) => {
      set((state) => {
        const next = mutate(state, (draft) => {
          // Only auto-switch to enhanced view if there was no enhanced content before
          // This preserves user's view choice when adding content from chat
          if (!draft.session.enhanced_memo_html) {
            draft.showRaw = false;
          }
          draft.session.enhanced_memo_html = note;
        });
        get().persistSession(next.session);
        return next;
      });
    },
    restoreEnhancedNote: async (note: string | null, showRaw?: boolean) => {
      const next = mutate(get(), (draft) => {
        draft.session.enhanced_memo_html = note;
        if (showRaw !== undefined) {
          draft.showRaw = showRaw;
        }
      });
      const persistence = get().persistSession(next.session, true);
      set(next);
      await persistence;
    },
    snapshotAutoEnhanced: (note: string) => {
      set((state) => {
        const next = mutate(state, (draft) => {
          draft.session.auto_enhanced_memo_html = note;
        });
        get().persistSession(next.session, true);
        return next;
      });
    },
    restoreAutoEnhanced: () => {
      return get().session.auto_enhanced_memo_html ?? null;
    },
    persistSession: async (session?: Session, force?: boolean) => {
      // Note actions pass their next snapshot before updating local state.
      // An omitted snapshot only flushes edits already queued by those actions.
      if (session) {
        const current = get().session;
        for (const field of ["title", "raw_memo_html"] as const) {
          if (session[field] !== current[field]) {
            pendingUpdates.set(field, { field, value: session[field] });
          }
        }
        for (const field of ["enhanced_memo_html", "auto_enhanced_memo_html", "pre_meeting_memo_html"] as const) {
          if (session[field] !== current[field]) {
            pendingUpdates.set(field, { field, value: session[field] });
          }
        }
      }

      await (force ? flushUpdates() : debouncedFlush());
    },
  }));
};
