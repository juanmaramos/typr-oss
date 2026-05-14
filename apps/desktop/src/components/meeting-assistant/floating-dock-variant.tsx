import { useLingui } from "@lingui/react/macro";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { FLOATING_DOCK_SURFACE_TRANSITION } from "@/components/app-shell/transitions";
import { TranscriptView } from "@/components/right-panel/views/transcript-view";
import GoogleMeetWaveform from "@/components/ui/google-meet-waveform";
import { Icon } from "@/components/ui/icon";
import { ModelSelector } from "@/components/ui/model-selector";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { promptInputClassNames, promptTextareaContracts } from "@/components/ui/prompt-input-contracts";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useRightPanel } from "@/contexts";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSession } from "@typr/utils/contexts";
import { useMatch } from "@tanstack/react-router";

import { ChatView } from "@/components/right-panel/views/chat-view";

const logDock = (event: string, payload?: Record<string, unknown>) => {
  debugLogFor("DEBUG_FLOATING", "DockDebug", event, payload ?? {});
};

const DOCK_POSITION_CLASS = "pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-6";
const DOCK_SURFACE_CLASS = promptInputClassNames.floatingShellSurface;
const DOCK_SHELL_CLASS = `${DOCK_SURFACE_CLASS} h-[min(54vh,480px)] max-w-[704px]`;

// ─── Pill icon button ────────────────────────────────────────────────────────

function PillIconButton({
  tooltip,
  onClick,
  children,
  className,
}: {
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "group flex h-[44px] w-[44px] items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-surface-400 hover:text-foreground active:scale-95",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Pill separator ──────────────────────────────────────────────────────────

function PillSeparator() {
  return <div className="h-5 w-px bg-border/60" />;
}

// ─── Dock pill (idle — not recording) ────────────────────────────────────────

function DockPillIdle({
  hasTranscript,
  hasActiveChat,
  onOpenTranscript,
  onOpenChat,
}: {
  hasTranscript: boolean;
  hasActiveChat: boolean;
  onOpenTranscript: () => void;
  onOpenChat: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className={DOCK_POSITION_CLASS}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-sidebar px-1.5 py-1 shadow-float-pill">
        <PillIconButton
          tooltip={hasTranscript ? t`Open transcript` : t`Start transcription`}
          onClick={onOpenTranscript}
        >
          <div className="flex items-center gap-[3px]">
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 8 }} />
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 18 }} />
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 13 }} />
          </div>
        </PillIconButton>

        <PillSeparator />

        <PillIconButton
          tooltip={hasActiveChat ? t`Continue chat` : t`Ask about this meeting`}
          onClick={onOpenChat}
        >
          <Icon name="ri-chat-ai-fill" className="h-5 w-5" />
        </PillIconButton>
      </div>
    </div>
  );
}

// ─── Dock pill (recording active) ────────────────────────────────────────────

function DockPillRecording({
  isPaused,
  hasActiveChat,
  onOpenTranscript,
  onOpenChat,
  onStop,
}: {
  isPaused: boolean;
  hasActiveChat: boolean;
  onOpenTranscript: () => void;
  onOpenChat: () => void;
  onStop: () => void;
}) {
  const { t } = useLingui();

  return (
    <div className={DOCK_POSITION_CLASS}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-sidebar px-1.5 py-1 shadow-float-pill">
        {/* Transcript group: waveform + stop */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenTranscript}
                className="group flex h-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-muted-foreground transition-all hover:bg-surface-400 hover:text-foreground active:scale-95"
              >
                <GoogleMeetWaveform
                  isRecording={!isPaused}
                  input="all"
                  size="compact"
                  color="blue-dark"
                />
                <Icon name="ri-arrow-up-s-line" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t`Open transcript`}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onStop}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full text-destructive transition-all hover:bg-destructive/10 active:scale-95"
              >
                <Icon name="ri-stop-fill" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t`Stop transcription`}
            </TooltipContent>
          </Tooltip>
        </div>

        <PillSeparator />

        {/* AI chat */}
        <PillIconButton
          tooltip={hasActiveChat ? t`Continue chat` : t`Ask about this meeting`}
          onClick={onOpenChat}
        >
          <Icon name="ri-chat-ai-fill" className="h-5 w-5" />
        </PillIconButton>
      </div>
    </div>
  );
}

// ─── Quick action recipes ────────────────────────────────────────────────────

function DockRecipes({ onQuickAction }: { onQuickAction: (prompt: string) => void }) {
  const { t } = useLingui();
  const quickActions = useMemo(
    () => [
      { label: t`Follow-up email`, prompt: "Write a follow up email for this meeting" },
      { label: t`Key takeaways`, prompt: "What were the key takeaways from this meeting? List them briefly" },
      { label: t`Short recap`, prompt: "Create a short summary of this meeting ready to share, 2-3 lines max" },
    ],
    [t],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickActions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onQuickAction(action.prompt)}
          className="h-9 rounded-full border-0 bg-surface-300 px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-300 hover:text-primary"
        >
          <span className="truncate">{action.label}</span>
        </Button>
      ))}
    </div>
  );
}

// ─── Dock composing state (prompt input with quick actions) ──────────────────

function DockComposing({
  draftPrompt,
  onDraftChange,
  onSubmit,
  onQuickAction,
  onOpenHistory,
  onMoveToSidebar,
  onMinimize,
  onCollapseIfEmpty,
  hasHistory,
  isRecording,
  isPaused,
  onOpenTranscript,
  onStop,
}: {
  draftPrompt: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onQuickAction: (prompt: string) => void;
  onOpenHistory: () => void;
  onMoveToSidebar: () => void;
  onMinimize: () => void;
  onCollapseIfEmpty: () => void;
  hasHistory: boolean;
  isRecording: boolean;
  isPaused: boolean;
  onOpenTranscript: () => void;
  onStop: () => void;
}) {
  const { t } = useLingui();
  const blurTimeoutRef = useRef<number | null>(null);
  const isModelSelectorOpenRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={DOCK_POSITION_CLASS}>
      <div
        className={cn(
          "pointer-events-auto w-full",
          promptInputClassNames.floatingExpandedSurface,
          FLOATING_DOCK_SURFACE_TRANSITION,
        )}
        style={{ maxWidth: "clamp(500px, 72vw, 680px)" }}
      >
        <div className="px-3 pb-3 pt-3">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <DockRecipes onQuickAction={onQuickAction} />
            <div className="flex items-center gap-1.5" onMouseDownCapture={(e) => e.preventDefault()}>
              {isRecording && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onOpenTranscript}
                        className="flex h-8 items-center justify-center gap-1 rounded-full px-2 text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
                      >
                        <GoogleMeetWaveform
                          isRecording={!isPaused}
                          input="all"
                          size="compact"
                          color="blue-dark"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t`Open transcript`}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onStop}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Icon name="ri-stop-fill" className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t`Stop transcription`}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
              <PillIconButton
                tooltip={hasHistory ? t`Show chat history` : t`No chat history yet`}
                onClick={onOpenHistory}
                className={cn(
                  "h-8 w-8 text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground",
                  !hasHistory && "cursor-not-allowed opacity-40",
                )}
              >
                <Icon name="ri-chat-history-line" className="h-4 w-4" />
              </PillIconButton>
              <PillIconButton
                tooltip={t`Move chat to sidebar`}
                onClick={onMoveToSidebar}
                className="h-8 w-8 text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
              >
                <Icon name="ri-layout-right-2-line" className="h-4 w-4" />
              </PillIconButton>
              <PillIconButton
                tooltip={t`Minimize`}
                onClick={onMinimize}
                className="h-8 w-8 text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
              >
                <IconArrowsDiagonalMinimize2 size={16} stroke={1.8} />
              </PillIconButton>
            </div>
          </div>

          <PromptInput
            value={draftPrompt}
            onValueChange={onDraftChange}
            onSubmit={onSubmit}
            maxHeight={136}
            debugName="floating-chat"
            className={promptInputClassNames.floatingDockSurface}
          >
            <div className="flex min-w-0 items-center gap-2">
              <PromptInputTextarea
                placeholder={t`Ask about this meeting`}
                autoFocus
                minHeight={promptTextareaContracts.floatingDock.minHeight}
                className={cn("min-w-0 flex-1", promptTextareaContracts.floatingDock.className)}
                onBlur={() => {
                  blurTimeoutRef.current = window.setTimeout(() => {
                    if (!draftPrompt.trim() && !isModelSelectorOpenRef.current) {
                      onCollapseIfEmpty();
                    }
                  }, 120);
                }}
                onFocus={() => {
                  if (blurTimeoutRef.current) {
                    window.clearTimeout(blurTimeoutRef.current);
                  }
                }}
              />
              <PromptInputActions
                className="ml-auto flex-shrink-0 gap-1.5"
                onMouseDownCapture={(e) => e.preventDefault()}
              >
                <ModelSelector
                  compact
                  onOpenChange={(open) => {
                    isModelSelectorOpenRef.current = open;
                  }}
                />
                <PromptInputAction tooltip={t`Send`}>
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!draftPrompt.trim()}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      draftPrompt.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground",
                    )}
                    aria-label={t`Send prompt`}
                  >
                    <Icon name="ri-arrow-up-line" className="h-4 w-4" />
                  </button>
                </PromptInputAction>
              </PromptInputActions>
            </div>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

// ─── Expanded shell (reuses existing ChatView / TranscriptView) ──────────────

function DockExpandedShell({
  view,
  noteTitle,
  onClose,
  onMoveToSidebar,
  onNewChat,
  pendingShowHistory,
  onPendingShowHistoryConsumed,
}: {
  view: "chat" | "transcript";
  noteTitle: string;
  onClose: () => void;
  onMoveToSidebar: () => void;
  onNewChat: () => void;
  pendingShowHistory: boolean;
  onPendingShowHistoryConsumed: () => void;
}) {
  return (
    <div
      className="pointer-events-auto w-full"
      style={{
        width: "clamp(640px, 74vw, 704px)",
        maxWidth: "100%",
      }}
    >
      <div className={DOCK_SHELL_CLASS}>
        {view === "transcript"
          ? (
            <TranscriptView
              showTabs={false}
              layout="floating"
              onClose={onClose}
              onMoveToSidebar={onMoveToSidebar}
            />
          )
          : (
            <ChatView
              layout="floating"
              title={noteTitle}
              onClose={onClose}
              onMoveToSidebar={onMoveToSidebar}
              onNewChat={onNewChat}
              initialShowHistory={pendingShowHistory}
              onInitialShowHistoryConsumed={onPendingShowHistoryConsumed}
            />
          )}
      </div>
    </div>
  );
}

// ─── Main dock variant ───────────────────────────────────────────────────────

type DockMode = "idle" | "composing";

export function FloatingDockVariant() {
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const {
    floatingState,
    surface,
    currentView,
    openFloating,
    collapseFloating,
    closeFloating,
    showSidebar,
    getChatGroup,
    newChatRequest,
    consumeNewChatRequest,
    queueFloatingPrompt,
    getChatDraft,
    setChatDraft,
    clearChatDraft,
  } = useRightPanel();
  const sessionId = noteMatch?.params.id ?? "";
  const { session } = useSession(sessionId, (state) => ({
    session: state.session,
  }));
  const ongoingSession = useOngoingSession((s) => ({
    start: s.start,
    pause: s.pause,
    resume: s.resume,
    stop: s.stop,
    status: s.status,
    sessionId: s.sessionId,
  }));
  const [pendingShowHistory, setPendingShowHistory] = useState(false);
  const [dockMode, setDockMode] = useState<DockMode>("idle");
  const prevViewRef = useRef(currentView);
  const handledNewChatRequestIdRef = useRef<number | null>(null);
  const draft = sessionId ? getChatDraft(sessionId) : "";
  const setDraft = useCallback((value: string) => {
    if (!sessionId) {
      return;
    }
    setChatDraft(sessionId, value);
  }, [sessionId, setChatDraft]);

  const chatHistorySummary = useQuery({
    queryKey: ["dock-chat-history-summary", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const groups = await dbCommands.listChatGroups(sessionId);
      const groupsWithMessages = await Promise.all(
        groups.map(async (group) => {
          const messages = await dbCommands.listChatMessages(group.id);
          return messages.some((msg) => msg.role === "User");
        }),
      );
      return groupsWithMessages.some(Boolean);
    },
    staleTime: 15000,
  });

  const activeFloatingChatGroupId = sessionId ? getChatGroup(sessionId) : null;

  const activeGroupHasMessages = useQuery({
    queryKey: ["dock-active-group-messages", activeFloatingChatGroupId],
    enabled: !!activeFloatingChatGroupId,
    queryFn: async () => {
      const messages = await dbCommands.listChatMessages(activeFloatingChatGroupId!);
      return messages.some((msg) => msg.role === "User");
    },
    staleTime: 5000,
  });

  useHotkeys(
    "esc",
    () => {
      if (floatingState === "expanded") {
        closeFloating();
        return;
      }
      if (dockMode === "composing") {
        setDockMode("idle");
      }
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [closeFloating, floatingState, dockMode],
  );

  useEffect(() => {
    logDock("surface_effect", { surface });
    if (surface !== "floating") {
      logDock("closing_surface_not_floating", { surface });
      closeFloating();
      setDockMode("idle");
    }
  }, [closeFloating, surface]);

  useEffect(() => {
    prevViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    if (surface !== "floating" || !sessionId || !newChatRequest || newChatRequest.sessionId !== sessionId) {
      return;
    }

    if (handledNewChatRequestIdRef.current === newChatRequest.requestId) {
      return;
    }

    handledNewChatRequestIdRef.current = newChatRequest.requestId;
    logDock("new_chat_compose_requested", {
      sessionId,
      requestId: newChatRequest.requestId,
      currentView,
      floatingState,
    });
    setPendingShowHistory(false);
    clearChatDraft(sessionId);
    setDockMode("composing");
    collapseFloating();
    consumeNewChatRequest(newChatRequest.requestId);
  }, [
    clearChatDraft,
    collapseFloating,
    consumeNewChatRequest,
    currentView,
    floatingState,
    newChatRequest,
    sessionId,
    surface,
  ]);

  const handleNewChatFromShell = () => {
    collapseFloating();
    setDockMode("composing");
  };

  if (!noteMatch || surface !== "floating") {
    return null;
  }

  const noteTitle = session.title || "Current note";
  const hasHistory = !!chatHistorySummary.data;
  const hasActiveChat = !!activeFloatingChatGroupId;
  const hasActiveChatMessages = !!activeGroupHasMessages.data;
  const hasTranscript = session.words.length > 0;

  const isActiveTranscriptSession = ongoingSession.sessionId === sessionId
    && (ongoingSession.status === "running_active" || ongoingSession.status === "running_paused");
  const isExpanded = floatingState === "expanded";

  const handleMoveToSidebar = () => {
    logDock("move_to_sidebar", { currentView, floatingState });
    showSidebar(currentView);
    setDockMode("idle");
  };

  const handleOpenTranscript = () => {
    openFloating("transcript");
    setDockMode("idle");
  };

  const handleOpenChat = () => {
    if (draft.trim()) {
      setDockMode("composing");
      return;
    }
    // If there's an active chat with messages, open it directly
    if (hasActiveChat && hasActiveChatMessages) {
      openFloating("chat", { focus: true });
      setDockMode("idle");
      return;
    }
    // Otherwise go to composing state
    setDockMode("composing");
  };

  const handleSubmitFromComposing = () => {
    const trimmedPrompt = draft.trim();
    if (!trimmedPrompt || !sessionId) {
      return;
    }

    logDock("submit_from_composing_expand", {
      sessionId,
      currentView,
      floatingState,
      promptLength: trimmedPrompt.length,
    });
    openFloating("chat", { focus: false });
    queueFloatingPrompt(sessionId, trimmedPrompt);
    clearChatDraft(sessionId);
    setDockMode("idle");
  };

  const handleQuickAction = (prompt: string) => {
    if (!sessionId) {
      return;
    }
    logDock("quick_action_expand", {
      sessionId,
      currentView,
      floatingState,
      promptLength: prompt.length,
    });
    openFloating("chat", { focus: false });
    queueFloatingPrompt(sessionId, prompt);
    clearChatDraft(sessionId);
    setDockMode("idle");
  };

  const handleOpenHistory = () => {
    setPendingShowHistory(true);
    setDockMode("idle");
    openFloating("chat", { focus: false });
  };

  const handleCollapseComposing = () => {
    setDockMode("idle");
  };

  const handleCloseExpanded = () => {
    logDock("close_expanded");
    collapseFloating();
  };

  const notePanelView = currentView === "project-brief" ? "chat" : currentView;

  const handleBackdropWheel = (e: React.WheelEvent) => {
    const editorArea = document.getElementById(`editor-area-${sessionId}`);
    if (editorArea) {
      editorArea.scrollTop += e.deltaY;
    }
  };

  // ── Expanded shell ──
  if (isExpanded) {
    return (
      <>
        <motion.div
          className="fixed inset-0 z-20 pointer-events-auto"
          onClick={handleCloseExpanded}
          onWheel={handleBackdropWheel}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        />
        <div className={DOCK_POSITION_CLASS}>
          <div className="w-full max-w-[704px]">
            <DockExpandedShell
              view={notePanelView}
              noteTitle={noteTitle}
              onClose={handleCloseExpanded}
              onMoveToSidebar={handleMoveToSidebar}
              onNewChat={handleNewChatFromShell}
              pendingShowHistory={pendingShowHistory}
              onPendingShowHistoryConsumed={() => setPendingShowHistory(false)}
            />
          </div>
        </div>
      </>
    );
  }

  // ── Composing state ──
  if (dockMode === "composing") {
    return (
      <>
        <div
          className="fixed inset-0 z-10 pointer-events-auto"
          onClick={handleCollapseComposing}
          onWheel={handleBackdropWheel}
          aria-hidden="true"
        />
        <DockComposing
          draftPrompt={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmitFromComposing}
          onQuickAction={handleQuickAction}
          onOpenHistory={handleOpenHistory}
          onMoveToSidebar={handleMoveToSidebar}
          onMinimize={handleCollapseComposing}
          onCollapseIfEmpty={handleCollapseComposing}
          hasHistory={hasHistory}
          isRecording={isActiveTranscriptSession}
          isPaused={ongoingSession.status === "running_paused"}
          onOpenTranscript={handleOpenTranscript}
          onStop={() => ongoingSession.stop()}
        />
      </>
    );
  }

  // ── Idle pill ──
  return (
    isActiveTranscriptSession
      ? (
        <DockPillRecording
          isPaused={ongoingSession.status === "running_paused"}
          hasActiveChat={hasActiveChat || hasHistory}
          onOpenTranscript={handleOpenTranscript}
          onOpenChat={handleOpenChat}
          onStop={() => ongoingSession.stop()}
        />
      )
      : (
        <DockPillIdle
          hasTranscript={hasTranscript}
          hasActiveChat={hasActiveChat || hasHistory}
          onOpenTranscript={handleOpenTranscript}
          onOpenChat={handleOpenChat}
        />
      )
  );
}
