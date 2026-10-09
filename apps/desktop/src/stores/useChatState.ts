import { create } from "zustand";
import type { Message } from "../components/right-panel/components/chat/types";

// Re-export for convenience
export type { Message };

interface SessionChatState {
  messages: Message[];
  isGenerating: boolean;
  editMode: "chat" | "edit";
  viewState: ChatViewState;
}

export interface ChatViewState {
  showHistory: boolean;
  historySearchValue: string;
  hasChatStarted: boolean;
  isSearchActive: boolean;
  searchTerm: string;
  researchMode: boolean;
  pendingEditorAction: PendingEditorAction | null;
}

export interface PendingEditorAction {
  requestId: string;
  sessionId: string;
  type: "improve-writing" | "edit-in-chat";
  selectedText?: string;
  range?: { from: number; to: number };
}

export const DEFAULT_CHAT_VIEW_STATE: ChatViewState = {
  showHistory: false,
  historySearchValue: "",
  hasChatStarted: false,
  isSearchActive: false,
  searchTerm: "",
  researchMode: false,
  pendingEditorAction: null,
};

interface ChatState {
  // Track state per session to support multiple sessions
  sessions: Record<string, SessionChatState>;

  // Messages
  getMessages: (sessionId: string) => Message[];
  setMessages: (sessionId: string, messages: Message[] | ((prev: Message[]) => Message[])) => void;

  // Generating state
  isGenerating: (sessionId: string) => boolean;
  setGenerating: (sessionId: string, generating: boolean) => void;

  // Edit mode (chat = Ask, edit = Edit)
  getEditMode: (sessionId: string) => "chat" | "edit";
  setEditMode: (sessionId: string, mode: "chat" | "edit") => void;

  // Chat panel UI state
  getViewState: (sessionId: string) => ChatViewState;
  setViewState: (sessionId: string, updates: Partial<ChatViewState>) => void;

  // Clear session state
  clearSession: (sessionId: string) => void;
}

// Helper to get default session state
const getDefaultSessionState = (): SessionChatState => ({
  messages: [],
  isGenerating: false,
  editMode: "chat", // Default to Ask mode
  viewState: DEFAULT_CHAT_VIEW_STATE,
});

export const useChatState = create<ChatState>((set, get) => ({
  sessions: {},

  getMessages: (sessionId: string) => {
    return get().sessions[sessionId]?.messages ?? [];
  },

  setMessages: (sessionId: string, messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => {
    set((state) => {
      const currentSession = state.sessions[sessionId] || getDefaultSessionState();
      const newMessages = typeof messagesOrUpdater === "function"
        ? messagesOrUpdater(currentSession.messages)
        : messagesOrUpdater;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            messages: newMessages,
          },
        },
      };
    });
  },

  isGenerating: (sessionId: string) => {
    return get().sessions[sessionId]?.isGenerating ?? false;
  },

  setGenerating: (sessionId: string, generating: boolean) => {
    set((state) => {
      const currentSession = state.sessions[sessionId] || getDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            isGenerating: generating,
          },
        },
      };
    });
  },

  getEditMode: (sessionId: string) => {
    return get().sessions[sessionId]?.editMode ?? "chat";
  },

  setEditMode: (sessionId: string, mode: "chat" | "edit") => {
    set((state) => {
      const currentSession = state.sessions[sessionId] || getDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            editMode: mode,
          },
        },
      };
    });
  },

  getViewState: (sessionId: string) => {
    return get().sessions[sessionId]?.viewState ?? DEFAULT_CHAT_VIEW_STATE;
  },

  setViewState: (sessionId: string, updates: Partial<ChatViewState>) => {
    set((state) => {
      const currentSession = state.sessions[sessionId] || getDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            viewState: {
              ...currentSession.viewState,
              ...updates,
            },
          },
        },
      };
    });
  },

  clearSession: (sessionId: string) => {
    set((state) => {
      const { [sessionId]: _, ...remainingSessions } = state.sessions;
      return { sessions: remainingSessions };
    });
  },
}));
