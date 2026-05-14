import { create as mutate } from "mutative";
import { createStore } from "zustand";

import { type Session } from "@typr/plugin-db";
import { createSessionStore, type SessionStore, type SessionStoreOptions } from "./session";

type State = {
  sessions: Record<string, SessionStore>;
};

type Actions = {
  insert: (session: Session) => SessionStore;
  remove: (sessionId: string) => void;
};

export type SessionsStore = ReturnType<typeof createSessionsStore>;

export type SessionsStoreOptions = SessionStoreOptions;

export const createSessionsStore = (options: SessionsStoreOptions = {}) => {
  return createStore<State & Actions>((set, get) => ({
    sessions: {},
    insert: (session: Session) => {
      const sessions = get().sessions;

      const existing = sessions[session.id];
      if (existing) {
        // Update existing store with fresh session data
        existing.setState({ session });
        return existing;
      }

      const store = createSessionStore(session, options);

      set((state) =>
        mutate(state, (draft) => {
          draft.sessions[session.id] = store;
        })
      );

      return store;
    },
    remove: (sessionId: string) => {
      const sessions = get().sessions;
      delete sessions[sessionId];
      set({ sessions });
    },
  }));
};
