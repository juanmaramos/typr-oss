import { useLingui } from "@lingui/react/macro";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ResponsiveIconButton } from "@typr/ui";
import { cn } from "@typr/ui/lib/utils";

import { AISetupIndicator } from "@/components/ui/ai-setup-indicator";
import { Tab } from "@/components/ui/tab";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr, useRightPanel } from "@/contexts";
import { useAgentWritingFeature } from "@/hooks/use-agent-writing-feature";
import { useTranscriptionActive } from "@/hooks/useTranscriptionActive";
import { ChatHistoryView, ChatInput, ChatMessagesView, EmptyChatState } from "../components/chat";
import { ChatSearchHeader } from "../components/search";
// No longer needed as these are used within the ChatHeader component

import { useEditModeModelSwitch } from "@/hooks/useEditModeModelSwitch.tsx";
import { useChatState } from "@/stores/useChatState";
import { useActiveEntity } from "../hooks/useActiveEntity";
import { useChatLogic } from "../hooks/useChatLogic";
import { useChatQueries } from "../hooks/useChatQueries";
import { focusInput, formatDate } from "../utils/chat-utils";

const logFloatingChatView = (event: string, payload?: Record<string, unknown>) => {
  debugLogFor("DEBUG_FLOATING", "FloatingDebug", `chat-view:${event}`, payload ?? {});
};

// Remix Icon Components - Used for header actions
function CheckIcon({ size = 16, className = "" }) {
  return <i className={`ri-check-line ${className}`} style={{ fontSize: size }} />;
}

function CopyIcon({ size = 16, className = "" }) {
  return <i className={`ri-file-copy-line ${className}`} style={{ fontSize: size }} />;
}

function PlusIcon({ size = 16, className = "" }) {
  return <i className={`ri-add-line ${className}`} style={{ fontSize: size }} />;
}

function TextSearchIcon({ size = 16, className = "" }) {
  return <i className={`ri-menu-search-line ${className}`} style={{ fontSize: size }} />;
}

function ChatHistoryIcon({ size = 16, className = "" }) {
  return <i className={`ri-chat-history-line ${className}`} style={{ fontSize: size }} />;
}

function SidebarIcon({ size = 16, className = "" }) {
  return <i className={`ri-layout-right-2-line ${className}`} style={{ fontSize: size }} />;
}

function MinimizeIcon({ size = 16, className = "" }) {
  return <IconArrowsDiagonalMinimize2 size={size} stroke={1.8} className={className} />;
}

interface ChatViewProps {
  layout?: "sidebar" | "floating";
  title?: string;
  onClose?: () => void;
  onMoveToSidebar?: () => void;
  onNewChat?: () => void;
  initialShowHistory?: boolean;
  onInitialShowHistoryConsumed?: () => void;
}

export function ChatView({
  layout = "sidebar",
  title,
  onClose,
  onMoveToSidebar,
  onNewChat,
  initialShowHistory = false,
  onInitialShowHistoryConsumed,
}: ChatViewProps = {}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const {
    isExpanded,
    chatInputRef,
    currentView,
    surface,
    switchView,
    getChatGroup,
    setChatGroup,
    getPendingFloatingPrompt,
    consumeFloatingPrompt,
    getChatDraft,
    setChatDraft,
    clearChatDraft,
    clearChatState,
    newChatRequest,
    requestNewChat,
    consumeNewChatRequest,
    isNewChatPending,
    completeNewChat,
  } = useRightPanel();

  // Local flag: stays true from "new chat" click until the new group is created.
  // Prevents the auto-select effect from immediately re-selecting the last group.
  const [isNewChatRequested, setIsNewChatRequested] = useState(false);
  const { isRecordingActive } = useTranscriptionActive();
  const { userId } = useTypr();

  // Container ref for measuring width
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive design breakpoints

  const [inputValue, setInputValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [hasChatStarted, setHasChatStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [researchMode, setResearchMode] = useState(false);
  const handledNewChatRequestIdRef = useRef<number | null>(null);

  const { activeEntity, sessionId } = useActiveEntity({
    setInputValue,
    setShowHistory,
    setHasChatStarted,
  });

  useEffect(() => {
    if (!sessionId) {
      setInputValue("");
      return;
    }
    setInputValue(getChatDraft(sessionId));
  }, [getChatDraft, sessionId]);

  const setPersistedInputValue = useCallback((value: string) => {
    setInputValue(value);
    if (!sessionId) {
      return;
    }
    if (value) {
      setChatDraft(sessionId, value);
      return;
    }
    clearChatDraft(sessionId);
  }, [clearChatDraft, sessionId, setChatDraft]);

  // Get editMode from store (per-session, defaults to "chat" / Ask mode)
  const { getEditMode, setEditMode: setEditModeInStore } = useChatState();
  const editMode = sessionId ? getEditMode(sessionId) : "chat";
  const isAgentWritingEnabled = useAgentWritingFeature();
  const effectiveEditMode = isAgentWritingEnabled ? editMode : "chat";

  // Wrapper to update store
  const setEditMode = (mode: "chat" | "edit") => {
    if (sessionId) {
      setEditModeInStore(sessionId, mode);
    }
  };

  const currentChatGroupId = sessionId ? getChatGroup(sessionId) : null;

  const setCurrentChatGroupId = useCallback((id: string | null) => {
    if (!sessionId) {
      return;
    }
    setChatGroup(sessionId, id);
  }, [sessionId, setChatGroup]);

  const pendingFloatingPrompt = sessionId
    ? getPendingFloatingPrompt(sessionId)
    : null;
  const isNewChatPendingForSession = sessionId ? isNewChatPending(sessionId) : false;
  const isActiveChatSurface = surface === "floating"
    ? layout === "floating"
    : layout === "sidebar";

  useEffect(() => {
    if (!isAgentWritingEnabled && editMode === "edit" && sessionId) {
      setEditModeInStore(sessionId, "chat");
    }
  }, [editMode, isAgentWritingEnabled, sessionId, setEditModeInStore]);

  // Auto-switch to cloud model when entering Edit mode
  useEditModeModelSwitch(effectiveEditMode);

  const { chatGroupsQuery, sessionData, getChatGroupId, chatHistory, totalSessionMessagesQuery } = useChatQueries({
    sessionId,
    userId,
    currentChatGroupId,
    setCurrentChatGroupId,
    setHasChatStarted,
    isNewChatRequested,
    setIsNewChatRequested,
    isNewChatPending: isNewChatPendingForSession,
    completeNewChat,
    isActiveSurface: isActiveChatSurface,
    allowAutoSelectLatest: isActiveChatSurface
      && !isNewChatRequested
      && !isNewChatPendingForSession
      && (layout !== "floating" || !pendingFloatingPrompt),
    selectionSource: layout === "floating" ? "floating" : "sidebar",
  });

  const {
    messages,
    isGenerating,
    handleSubmit,
    handleSubmitWithValue,
    handleQuickAction,
    handleApplyMarkdown,
    handleImproveWriting,
    handleKeyDown,
    handleStop,
  } = useChatLogic({
    sessionId,
    userId,
    activeEntity,
    inputValue,
    hasChatStarted,
    setInputValue: setPersistedInputValue,
    setHasChatStarted,
    getChatGroupId,
    sessionData,
    chatInputRef,
    totalSessionMessages: totalSessionMessagesQuery.data || 0,
    editMode: effectiveEditMode, // Pass explicit mode
    researchMode,
    setResearchMode,
  });

  // Removed noisy log - editMode visible in React DevTools if needed

  const hasMessages = messages.length > 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPersistedInputValue(e.target.value);
  };

  // Listen for improve writing requests from editor
  useEffect(() => {
    const handleImproveWritingRequest = (event: CustomEvent) => {
      const { selectedText, range, sessionId: eventSessionId, action } = event.detail;

      // Only handle if it's for the current session
      if (eventSessionId === sessionId) {
        if (action === "improve" || action === "improveWriting") {
          // Direct improvement - bypass chat input
          handleImproveWriting(selectedText, range);
        } else if (action === "editInChat") {
          // Edit in Chat - just set selection context, let user type their message
          // The selection context is already set by the selection store
          // Just focus the input so user can type
          if (chatInputRef.current) {
            chatInputRef.current.focus();
          }
        }
      }
    };

    const handleEditInChatRequest = (event: CustomEvent) => {
      const { sessionId: eventSessionId } = event.detail;

      // Only handle if it's for the current session
      if (eventSessionId === sessionId) {
        // Edit in Chat (⌘L) - focus input and prepare for editing
        if (chatInputRef.current) {
          chatInputRef.current.focus();
        }
        // Selection context is already set by the SelectionActions component
      }
    };

    // Listen for both improve writing and edit in chat events
    window.addEventListener("improveWritingRequested", handleImproveWritingRequest as EventListener);
    window.addEventListener("editInChatRequested", handleEditInChatRequest as EventListener);

    return () => {
      window.removeEventListener("improveWritingRequested", handleImproveWritingRequest as EventListener);
      window.removeEventListener("editInChatRequested", handleEditInChatRequest as EventListener);
    };
  }, [handleImproveWriting, sessionId, chatInputRef]);

  const handleFocusInput = () => {
    focusInput(chatInputRef);
  };

  const resetChatViewState = useCallback(() => {
    if (!sessionId) {
      return;
    }

    debugLogFor("DEBUG_CHAT", "ChatDebug", "creating new chat and clearing current state", {
      sessionId,
      oldChatGroupId: currentChatGroupId,
    });
    setIsNewChatRequested(true);
    clearChatState(sessionId);
    const { clearSession } = useChatState.getState();
    clearSession(sessionId);
    setHasChatStarted(false);
    setPersistedInputValue("");
    setSearchValue("");
    setShowHistory(false);
    setIsSearchActive(false);
    setCopied(false);
    setCurrentChatGroupId(null);
    debugLogFor("DEBUG_CHAT", "ChatDebug", "new chat ready; current chat group is null");
  }, [sessionId, currentChatGroupId, clearChatState, setCurrentChatGroupId, setPersistedInputValue]);

  const handleNewChat = useCallback(async () => {
    if (!sessionId || !userId) {
      return;
    }

    const requestId = requestNewChat(sessionId);
    handledNewChatRequestIdRef.current = requestId;
    resetChatViewState();
    onNewChat?.();
  }, [sessionId, userId, requestNewChat, resetChatViewState, onNewChat]);

  // Apply new-chat requests even when ChatView mounts after the request was made.
  useEffect(() => {
    if (!sessionId || !newChatRequest || newChatRequest.sessionId !== sessionId) {
      return;
    }

    if (handledNewChatRequestIdRef.current === newChatRequest.requestId) {
      return;
    }

    handledNewChatRequestIdRef.current = newChatRequest.requestId;
    debugLogFor("DEBUG_CHAT", "ChatDebug", "received new chat request for current session", {
      sessionId,
      requestId: newChatRequest.requestId,
    });
    resetChatViewState();
    consumeNewChatRequest(newChatRequest.requestId);
  }, [consumeNewChatRequest, newChatRequest, resetChatViewState, sessionId]);

  const handleViewHistory = () => {
    setShowHistory(true);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleSelectChat = (chatId: string) => {
    setCurrentChatGroupId(chatId);
    setShowHistory(false);
  };

  const handleBackToChat = () => {
    setShowHistory(false);
  };

  const handleNoteBadgeClick = () => {
    if (activeEntity) {
      navigate({ to: `/app/${activeEntity.type}/$id`, params: { id: activeEntity.id } });
    }
  };

  const handleCopyChat = async () => {
    if (messages.length > 0) {
      const text = messages.map(msg => {
        const prefix = msg.isUser ? "You: " : "Assistant: ";
        return `${prefix}${msg.content}`;
      }).join("\n\n");

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
      }
    }
  };

  useEffect(() => {
    if (isExpanded || layout === "floating") {
      const focusTimeout = setTimeout(() => {
        if (layout === "floating") {
          logFloatingChatView("focus_effect", {
            sessionId,
            currentChatGroupId,
            messageCount: messages.length,
            activeElementTagBefore: document.activeElement?.tagName ?? null,
          });
        }
        focusInput(chatInputRef);
      }, 200);

      return () => clearTimeout(focusTimeout);
    }
  }, [isExpanded, currentChatGroupId, layout, sessionId]);

  useEffect(() => {
    if (!pendingFloatingPrompt || !sessionId || !isActiveChatSurface) {
      return;
    }

    const trimmedPrompt = pendingFloatingPrompt.trim();

    // Consume immediately — prevents re-run if handleSubmitWithValue identity changes
    consumeFloatingPrompt(sessionId);

    if (trimmedPrompt) {
      if (layout === "floating") {
        handleSubmitWithValue(trimmedPrompt, {
          bypassDebounce: true,
          source: "floating-queued-prompt",
        });
      } else {
        // Draft transferred from floating → sidebar: populate input without submitting
        setPersistedInputValue(trimmedPrompt);
      }
    }
  }, [
    consumeFloatingPrompt,
    handleSubmitWithValue,
    isActiveChatSurface,
    layout,
    pendingFloatingPrompt,
    setPersistedInputValue,
    sessionId,
  ]);

  useEffect(() => {
    if (!initialShowHistory) {
      return;
    }

    setShowHistory(true);
    onInitialShowHistoryConsumed?.();
  }, [initialShowHistory, onInitialShowHistoryConsumed]);

  return (
    <div className="w-full h-full flex flex-col" ref={containerRef}>
      {showHistory && (
        <ChatHistoryView
          chatHistory={chatHistory}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onBackToChat={handleBackToChat}
          formatDate={formatDate}
        />
      )}
      {!showHistory && (
        <>
          {/* Search header when search is active */}
          {isSearchActive && (
            <ChatSearchHeader
              onClose={() => setIsSearchActive(false)}
              messages={messages}
            />
          )}

          <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Tab Actions Bar - Integrated styling */}
            {!isSearchActive && (
              <div className="relative">
                <div
                  className={layout === "floating"
                    ? "flex items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-6 py-3"
                    : "flex items-center justify-between gap-2 px-4 py-3 bg-background"}
                >
                  {layout === "sidebar"
                    ? (
                      <div className="flex items-center gap-5 border-b border-border">
                        <Tab
                          text={t`Chat`}
                          value="chat"
                          selected={currentView === "chat"}
                          onSelect={(value) => switchView(value as "chat" | "transcript")}
                        />
                        <Tab
                          text={t`Transcript`}
                          value="transcript"
                          selected={currentView === "transcript"}
                          showRecordingIndicator={isRecordingActive}
                          onSelect={(value) => switchView(value as "chat" | "transcript")}
                        />
                      </div>
                    )
                    : (
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="truncate text-[16px] font-semibold leading-tight text-foreground">
                          {title || sessionData.data?.title || t`Current note`}
                        </div>
                        <div className="pt-0.5 text-[12px] leading-tight text-muted-foreground">
                          {t`Ask in context of this meeting`}
                        </div>
                      </div>
                    )}

                  {/* Right side - Action buttons */}
                  <div
                    className={layout === "floating"
                      ? "flex items-center gap-2"
                      : "flex items-center gap-0.5"}
                  >
                    <ResponsiveIconButton
                      icon={PlusIcon}
                      text={t`New chat`}
                      onClick={handleNewChat}
                      disabled={!hasMessages}
                      displayMode="icon"
                      variant="ghost"
                      size="icon"
                      className={layout === "floating"
                        ? "h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70 disabled:opacity-40"
                        : "h-7 w-7 text-foreground hover:text-foreground hover:bg-background/50 disabled:opacity-40"}
                    />

                    {chatGroupsQuery.data && chatGroupsQuery.data.length > 0 && (
                      <ResponsiveIconButton
                        icon={ChatHistoryIcon}
                        text={t`History`}
                        onClick={handleViewHistory}
                        displayMode="icon"
                        variant="ghost"
                        size="icon"
                        className={layout === "floating"
                          ? "h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
                          : "h-7 w-7 text-foreground hover:text-foreground hover:bg-background/50"}
                      />
                    )}

                    {hasMessages && (
                      <ResponsiveIconButton
                        icon={TextSearchIcon}
                        text={t`Search`}
                        onClick={() => setIsSearchActive(true)}
                        displayMode="icon"
                        variant="ghost"
                        size="icon"
                        className={layout === "floating"
                          ? "h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
                          : "h-7 w-7 text-foreground hover:text-foreground hover:bg-background/50"}
                      />
                    )}

                    {hasMessages && (
                      <ResponsiveIconButton
                        icon={copied ? CheckIcon : CopyIcon}
                        text={copied ? t`Copied!` : t`Copy`}
                        onClick={handleCopyChat}
                        displayMode="icon"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-7 w-7 transition-all duration-200",
                          layout === "floating" ? "hover:bg-surface-400/70" : "hover:bg-background/50",
                          copied ? "text-success" : "text-foreground hover:text-foreground",
                        )}
                      />
                    )}

                    {layout === "floating" && onMoveToSidebar && (
                      <ResponsiveIconButton
                        icon={SidebarIcon}
                        text={t`Move to sidebar`}
                        onClick={onMoveToSidebar}
                        displayMode="icon"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
                      />
                    )}

                    {layout === "floating" && onClose && (
                      <ResponsiveIconButton
                        icon={MinimizeIcon}
                        text={t`Minimize`}
                        onClick={onClose}
                        displayMode="icon"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI Setup Banner - Below header */}
            <AISetupIndicator />
            {/* Messages Area */}
            <div className="flex-1 flex flex-col min-h-0">
              {messages.length === 0
                ? layout === "sidebar"
                  ? (
                    <EmptyChatState
                      onQuickAction={handleQuickAction}
                      onFocusInput={handleFocusInput}
                      layout={layout}
                    />
                  )
                  : <div className="flex-1" />
                : (
                  <ChatMessagesView
                    messages={messages}
                    sessionTitle={sessionData.data?.title || t`New note`}
                    hasEnhancedNote={true}
                    onApplyMarkdown={handleApplyMarkdown}
                    isGenerating={isGenerating}
                    sessionId={sessionId || undefined}
                    editMode={effectiveEditMode}
                    chatGroupId={currentChatGroupId || undefined}
                    layout={layout}
                  />
                )}
            </div>

            {/* Input Area - Fixed at bottom with proper spacing */}
            <div className="flex-shrink-0 bg-background">
              <ChatInput
                inputValue={inputValue}
                onChange={handleInputChange}
                onSubmit={handleSubmit}
                onStop={handleStop}
                onKeyDown={handleKeyDown}
                autoFocus={true}
                entityId={activeEntity?.id}
                entityType={activeEntity?.type}
                onNoteBadgeClick={handleNoteBadgeClick}
                isGenerating={isGenerating}
                editMode={effectiveEditMode}
                onEditModeChange={setEditMode}
                researchMode={researchMode}
                onResearchModeChange={setResearchMode}
                layout={layout}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
