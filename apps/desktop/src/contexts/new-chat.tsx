import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useChatState } from "@/stores/useChatState";
import { useRightPanel } from "./layout";

interface NewChatContextType {
  createNewChat: () => void;
}

const NewChatContext = createContext<NewChatContextType | null>(null);

export function NewChatProvider({ children }: { children: React.ReactNode }) {
  const {
    chatInputRef,
    currentView,
    isViewVisible,
    requestNewChat,
    showFloatingDock,
    showSidebar,
    surface,
  } = useRightPanel();
  const router = useRouter();

  const createNewChat = useCallback(() => {
    // Get the current session ID from the router state
    const currentPath = router.state.location.pathname;
    const sessionMatch = currentPath.match(/\/app\/(session|note)\/([^/]+)/);

    if (!sessionMatch) {
      console.warn("[NewChat] Not on a session or note page");
      return;
    }

    const sessionId = sessionMatch[2];
    console.log("[NewChat] Creating new chat via context", { sessionId });

    requestNewChat(sessionId);
    useChatState.getState().clearSession(sessionId);

    if (surface === "floating") {
      showFloatingDock("chat");
    } else if (!isViewVisible("chat") || currentView !== "chat") {
      showSidebar("chat");
    } else {
      // If already on chat, just focus the input after a brief delay for state update
      setTimeout(() => {
        if (chatInputRef.current) {
          chatInputRef.current.focus();
        }
      }, 100);
    }
  }, [chatInputRef, currentView, isViewVisible, requestNewChat, router, showFloatingDock, showSidebar, surface]);

  // Register Cmd+Shift+N / Ctrl+Shift+N shortcut
  useHotkeys(
    "mod+shift+n",
    (event) => {
      event.preventDefault();
      createNewChat();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <NewChatContext.Provider value={{ createNewChat }}>
      {children}
    </NewChatContext.Provider>
  );
}

export function useNewChat() {
  const context = useContext(NewChatContext);
  if (!context) {
    throw new Error("useNewChat must be used within NewChatProvider");
  }
  return context;
}
