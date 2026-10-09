import { useEffect } from "react";

import { useRightPanel } from "@/contexts";
import { useChatState, type PendingEditorAction } from "@/stores/useChatState";

interface EditorRequestDetail {
  sessionId?: string;
  selectedText?: string;
  range?: { from: number; to: number };
  action?: string;
}

export function useAssistantEditorRequests(sessionId: string | null) {
  const { currentView, floatingState, surface, openFloating, switchView } = useRightPanel();
  const setViewState = useChatState((state) => state.setViewState);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const activateChat = () => {
      if (surface === "floating" && floatingState !== "expanded") {
        openFloating("chat", { focus: false });
      } else if (currentView !== "chat") {
        switchView("chat");
      }
    };

    const queueAction = (detail: EditorRequestDetail, type: PendingEditorAction["type"]) => {
      if (detail.sessionId !== sessionId) {
        return;
      }

      setViewState(sessionId, {
        pendingEditorAction: {
          requestId: crypto.randomUUID(),
          sessionId,
          type,
          selectedText: detail.selectedText,
          range: detail.range,
        },
      });
      activateChat();
    };

    const handleImproveWriting = (event: Event) => {
      const detail = (event as CustomEvent<EditorRequestDetail>).detail;
      if (!detail) {
        return;
      }

      queueAction(
        detail,
        detail.action === "editInChat" ? "edit-in-chat" : "improve-writing",
      );
    };

    const handleEditInChat = (event: Event) => {
      const detail = (event as CustomEvent<EditorRequestDetail>).detail;
      if (detail) {
        queueAction(detail, "edit-in-chat");
      }
    };

    window.addEventListener("improveWritingRequested", handleImproveWriting);
    window.addEventListener("editInChatRequested", handleEditInChat);

    return () => {
      window.removeEventListener("improveWritingRequested", handleImproveWriting);
      window.removeEventListener("editInChatRequested", handleEditInChat);
    };
  }, [currentView, floatingState, openFloating, sessionId, setViewState, surface, switchView]);
}
