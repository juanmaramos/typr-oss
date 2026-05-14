import { useAudioUploadStore } from "@/stores/audio-upload";
import { useLingui } from "@lingui/react/macro";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
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
import { useRecordingTimer } from "@/hooks/useRecordingTimer";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSession } from "@typr/utils/contexts";
import { useMatch } from "@tanstack/react-router";

import { ChatView } from "@/components/right-panel/views/chat-view";
import { canSwitchFloatingVariant, useFeatureFlags } from "@/stores/feature-flags";
import { FloatingDockVariant } from "./floating-dock-variant";

type AssistantViewState = "idle" | "composing";

const logFloating = (event: string, payload?: Record<string, unknown>) => {
  debugLogFor("DEBUG_FLOATING", "FloatingDebug", event, payload ?? {});
};

const FLOATING_DOCK_LAYOUT = {
  railMaxWidthClass: "max-w-[704px]",
  collapsedWidth: "clamp(500px, 72vw, 680px)",
  expandedWidth: "clamp(640px, 74vw, 704px)",
  gapClass: "gap-1.5",
  transcriptCollapsedSize: 54,
  transcriptRecordingWidth: 116,
  transcriptExpandedWidth: 212,
} as const;
const FLOATING_DOCK_POSITION_CLASS = "pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-6";
const FLOATING_SURFACE_CLASS = promptInputClassNames.floatingShellSurface;
const FLOATING_OPEN_SHELL_CLASS = `${FLOATING_SURFACE_CLASS} h-[min(54vh,480px)] max-w-[704px]`;

function useFloatingAssistantState() {
  const [viewState, setViewState] = useState<AssistantViewState>("idle");
  const [pendingShowHistory, setPendingShowHistory] = useState(false);

  const openComposer = () => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "floating → composing");
    setViewState("composing");
  };
  const collapseComposer = () => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "floating → idle");
    setViewState("idle");
  };
  const closeToIdle = () => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "floating → idle (reset)");
    setViewState("idle");
    setPendingShowHistory(false);
  };

  return {
    viewState,
    setViewState,
    pendingShowHistory,
    setPendingShowHistory,
    openComposer,
    collapseComposer,
    closeToIdle,
  };
}

function FloatingDockRecipes({ onQuickAction }: { onQuickAction: (prompt: string) => void }) {
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

type FloatingDockIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  tooltipClassName?: string;
};

function FloatingDockIconButton({
  tooltip,
  side = "top",
  tooltipClassName,
  className,
  children,
  ...props
}: FloatingDockIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={className} {...props}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className={cn("text-xs", tooltipClassName)}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface FloatingDockProps {
  mode: "idle" | "composing";
  draftPrompt: string;
  onDraftChange: (value: string) => void;
  onFocusCompose: () => void;
  onCollapseIfEmpty: () => void;
  onSubmit: () => void;
  onQuickAction: (prompt: string) => void;
  onOpenHistory: () => void;
  onMoveToSidebar: () => void;
  onMinimize: () => void;
  hasHistory: boolean;
  embedded?: boolean;
}

function FloatingDock({
  mode,
  draftPrompt,
  onDraftChange,
  onFocusCompose,
  onCollapseIfEmpty,
  onSubmit,
  onQuickAction,
  onOpenHistory,
  onMoveToSidebar,
  onMinimize,
  hasHistory,
  embedded = false,
}: FloatingDockProps) {
  const { t } = useLingui();
  const isComposing = mode === "composing";
  const blurTimeoutRef = useRef<number | null>(null);
  const isModelSelectorOpenRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const content = (
    <div
      className={cn(
        "pointer-events-auto w-full",
        FLOATING_DOCK_SURFACE_TRANSITION,
        isComposing
          ? promptInputClassNames.floatingExpandedSurface
          : embedded
          ? "max-w-none"
          : "max-w-[704px]",
      )}
    >
      <div className={cn(isComposing ? "px-3 pb-3 pt-3" : "py-0")}>
        {isComposing && (
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <FloatingDockRecipes onQuickAction={onQuickAction} />
            <div className="flex items-center gap-1.5" onMouseDownCapture={(e) => e.preventDefault()}>
              <FloatingDockIconButton
                tooltip={hasHistory ? t`Show chat history` : t`No chat history yet`}
                onClick={onOpenHistory}
                disabled={!hasHistory}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="ri-chat-history-line" className="h-4 w-4" />
              </FloatingDockIconButton>
              <FloatingDockIconButton
                tooltip={t`Move chat to sidebar`}
                onClick={onMoveToSidebar}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
              >
                <Icon name="ri-layout-right-2-line" className="h-4 w-4" />
              </FloatingDockIconButton>
              <FloatingDockIconButton
                tooltip={t`Minimize`}
                onClick={onMinimize}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-400 hover:text-foreground"
              >
                <IconArrowsDiagonalMinimize2 size={16} stroke={1.8} />
              </FloatingDockIconButton>
            </div>
          </div>
        )}

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
              minHeight={promptTextareaContracts.floatingDock.minHeight}
              className={cn("min-w-0 flex-1", promptTextareaContracts.floatingDock.className)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  logFloating("dock_enter_submit", {
                    mode,
                    hasDraft: !!draftPrompt.trim(),
                    draftLength: draftPrompt.trim().length,
                  });
                }
              }}
              onFocus={() => {
                if (blurTimeoutRef.current) {
                  window.clearTimeout(blurTimeoutRef.current);
                }
                logFloating("dock_focus", {
                  mode,
                  hasDraft: !!draftPrompt.trim(),
                  draftLength: draftPrompt.trim().length,
                });
                onFocusCompose();
              }}
              onBlur={() => {
                blurTimeoutRef.current = window.setTimeout(() => {
                  if (!draftPrompt.trim() && !isModelSelectorOpenRef.current) {
                    onCollapseIfEmpty();
                  }
                }, 120);
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
  );

  if (embedded) {
    return content;
  }

  return (
    <div className={FLOATING_DOCK_POSITION_CLASS}>
      {content}
    </div>
  );
}

function FloatingTranscriptEntry({
  isRecording,
  hasTranscript,
  elapsedLabel,
  onOpen,
  onPauseResume,
  onStop,
  isPaused,
}: {
  isRecording: boolean;
  hasTranscript: boolean;
  elapsedLabel: string;
  onOpen: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  isPaused: boolean;
}) {
  const { t } = useLingui();

  if (!isRecording) {
    return (
      <FloatingDockIconButton
        tooltip={hasTranscript ? t`Open transcript` : t`Start transcription`}
        side="top"
        onClick={onOpen}
        className="group pointer-events-auto flex h-[54px] w-[54px] items-center justify-center rounded-full bg-background shadow-float-pill"
      >
        <div className="flex h-[44px] w-[44px] items-center justify-center gap-1 rounded-full text-muted-foreground transition-colors group-hover:bg-surface-400">
          <div className="flex items-center gap-[3px]">
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 8 }} />
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 18 }} />
            <div className="w-[2.5px] rounded-full bg-current" style={{ height: 13 }} />
          </div>
          <Icon name="ri-arrow-up-s-line" className="h-4 w-4" />
        </div>
      </FloatingDockIconButton>
    );
  }

  return (
    <div className="pointer-events-auto flex h-[62px] items-center rounded-full bg-background p-1 shadow-float-pill">
      <button
        type="button"
        onClick={onOpen}
        className="group flex h-full flex-1 items-center justify-center gap-1 rounded-full text-muted-foreground transition-colors hover:bg-surface-400"
      >
        <GoogleMeetWaveform
          isRecording={!isPaused}
          input="all"
          size="compact"
          color="blue-dark"
        />
        <Icon name="ri-arrow-up-s-line" className="h-4 w-4" />
      </button>
      <FloatingDockIconButton
        tooltip={t`Stop transcription`}
        onClick={onStop}
        className="flex h-full w-[52px] flex-shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
      >
        <Icon name="ri-stop-fill" className="h-5 w-5" />
      </FloatingDockIconButton>
    </div>
  );
}

function FloatingAssistantRail({
  transcriptEntry,
  chatEntry,
  transcriptColumnWidth = FLOATING_DOCK_LAYOUT.transcriptExpandedWidth,
  showTranscriptEntry = true,
}: {
  transcriptEntry: React.ReactNode;
  chatEntry: React.ReactNode;
  transcriptColumnWidth?: number;
  showTranscriptEntry?: boolean;
}) {
  return (
    <div className={FLOATING_DOCK_POSITION_CLASS}>
      <div
        className="w-full"
        style={{
          width: FLOATING_DOCK_LAYOUT.collapsedWidth,
          maxWidth: "100%",
        }}
      >
        <div
          className={cn("pointer-events-auto grid w-full items-center relative", FLOATING_DOCK_LAYOUT.gapClass)}
          style={{
            gridTemplateColumns: showTranscriptEntry ? `${transcriptColumnWidth}px minmax(0, 1fr)` : "minmax(0, 1fr)",
          }}
        >
          {showTranscriptEntry && (
            <div
              className="flex-shrink-0"
              style={{ width: transcriptColumnWidth }}
            >
              {transcriptEntry}
            </div>
          )}
          {showTranscriptEntry && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-10 bg-gradient-to-r from-transparent via-sidebar/40 to-transparent"
              style={{ left: transcriptColumnWidth - 14 }}
            />
          )}
          <div className="min-w-0 flex-1">
            {chatEntry}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingAssistantShell({
  view,
  noteTitle,
  onClose,
  onMoveToSidebar,
  pendingShowHistory,
  onPendingShowHistoryConsumed,
}: {
  view: "chat" | "transcript";
  noteTitle: string;
  onClose: () => void;
  onMoveToSidebar: () => void;
  pendingShowHistory: boolean;
  onPendingShowHistoryConsumed: () => void;
}) {
  return (
    <div
      className="pointer-events-auto w-full"
      style={{
        width: FLOATING_DOCK_LAYOUT.expandedWidth,
        maxWidth: "100%",
      }}
    >
      <div className={FLOATING_OPEN_SHELL_CLASS}>
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
              initialShowHistory={pendingShowHistory}
              onInitialShowHistoryConsumed={onPendingShowHistoryConsumed}
              onMoveToSidebar={onMoveToSidebar}
            />
          )}
      </div>
    </div>
  );
}

export function FloatingMeetingAssistant() {
  const variant = useFeatureFlags((s) => s.floatingVariant);
  const toggleVariant = useFeatureFlags((s) => s.toggleFloatingVariant);

  useHotkeys(
    "mod+shift+u",
    (e) => {
      e.preventDefault();
      toggleVariant();
    },
    { enableOnFormTags: true, enableOnContentEditable: true, enabled: canSwitchFloatingVariant },
    [toggleVariant],
  );

  return (
    <>
      {variant === "dock" ? <FloatingDockVariant /> : <FloatingRailVariant />}
      {/* Dev-only variant indicator — remove after A/B test */}
      {canSwitchFloatingVariant && (
        <div className="pointer-events-auto fixed bottom-1 right-2 z-50">
          <button
            type="button"
            onClick={toggleVariant}
            className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
          >
            {variant === "dock" ? "dock" : "rail"} ⌘⇧U
          </button>
        </div>
      )}
    </>
  );
}

function FloatingRailVariant() {
  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const {
    floatingState,
    surface,
    currentView,
    openFloating,
    collapseFloating,
    closeFloating,
    showSidebar,
    switchView,
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
  const { elapsedMinutes } = useRecordingTimer();
  const {
    viewState,
    pendingShowHistory,
    setPendingShowHistory,
    openComposer,
    collapseComposer,
    closeToIdle,
  } = useFloatingAssistantState();
  const lastShellCloseAtRef = useRef<number | null>(null);
  const handledNewChatRequestIdRef = useRef<number | null>(null);
  const draft = sessionId ? getChatDraft(sessionId) : "";
  const setDraft = useCallback((value: string) => {
    if (!sessionId) {
      return;
    }
    setChatDraft(sessionId, value);
  }, [sessionId, setChatDraft]);

  const chatHistorySummary = useQuery({
    queryKey: ["floating-chat-history-summary", sessionId],
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
    queryKey: ["floating-active-group-messages", activeFloatingChatGroupId],
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
      if (currentView === "chat" && floatingState === "expanded") {
        closeFloating();
        return;
      }

      if (currentView === "transcript" && floatingState === "expanded") {
        closeFloating();
        return;
      }

      if (currentView === "chat" && viewState === "composing") {
        collapseComposer();
      }
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [closeFloating, collapseComposer, currentView, floatingState, viewState],
  );

  useEffect(() => {
    if (surface !== "floating") {
      closeFloating();
      closeToIdle();
    }
  }, [closeFloating, closeToIdle, surface]);

  useEffect(() => {
    if (surface !== "floating" || !sessionId || !newChatRequest || newChatRequest.sessionId !== sessionId) {
      return;
    }

    if (handledNewChatRequestIdRef.current === newChatRequest.requestId) {
      return;
    }

    handledNewChatRequestIdRef.current = newChatRequest.requestId;
    logFloating("new_chat_compose_requested", {
      sessionId,
      requestId: newChatRequest.requestId,
      currentView,
      floatingState,
      viewState,
    });
    clearChatDraft(sessionId);
    setPendingShowHistory(false);
    openComposer();
    switchView("chat");
    collapseFloating();
    consumeNewChatRequest(newChatRequest.requestId);
  }, [
    collapseFloating,
    consumeNewChatRequest,
    currentView,
    floatingState,
    newChatRequest,
    openComposer,
    sessionId,
    clearChatDraft,
    setPendingShowHistory,
    surface,
    switchView,
    viewState,
  ]);

  if (!noteMatch || surface !== "floating") {
    return null;
  }

  const noteTitle = session.title || "Current note";
  const hasHistory = !!chatHistorySummary.data;
  const hasActiveFloatingChat = !!activeFloatingChatGroupId;
  const hasActiveFloatingChatMessages = !!activeGroupHasMessages.data;

  const handleMoveToSidebar = () => {
    logFloating("move_to_sidebar", {
      currentView,
      floatingState,
      viewState,
    });
    showSidebar(currentView);
  };

  const handleOpenHistory = () => {
    logFloating("open_history_request", {
      currentView,
      floatingState,
      viewState,
      hasHistory,
    });
    setPendingShowHistory(true);
    openFloating("chat", { focus: false });
  };

  const handleSubmitToThread = () => {
    const trimmedPrompt = draft.trim();
    logFloating("submit_from_dock", {
      hasDraft: !!trimmedPrompt,
      draftLength: trimmedPrompt.length,
      currentView,
      floatingState,
      viewState,
    });
    if (!trimmedPrompt) {
      return;
    }

    if (!sessionId) {
      logFloating("queue_prompt_blocked_no_session", {
        promptLength: trimmedPrompt.length,
      });
      return;
    }

    logFloating("submit_from_dock_expand", {
      sessionId,
      currentView,
      floatingState,
      promptLength: trimmedPrompt.length,
    });
    openFloating("chat", { focus: false });
    queueFloatingPrompt(sessionId, trimmedPrompt);
    clearChatDraft(sessionId);
    closeToIdle();
    logFloating("queue_prompt_for_submit", {
      sessionId,
      promptLength: trimmedPrompt.length,
    });
  };

  const isTranscriptActive = currentView === "transcript";
  const isActiveTranscriptSession = ongoingSession.sessionId === sessionId
    && (ongoingSession.status === "running_active" || ongoingSession.status === "running_paused");
  const hasTranscript = session.words.length > 0;
  const isChatFocused = currentView === "chat" && viewState === "composing";
  const isChatExpanded = currentView === "chat" && floatingState === "expanded";
  const isTranscriptExpanded = currentView === "transcript" && floatingState === "expanded";
  const presentationMode = isTranscriptExpanded
    ? "transcript-expanded"
    : isChatExpanded
    ? "chat-expanded"
    : isChatFocused
    ? "chat-focused-rail"
    : "rail-idle";

  logFloating("presentation_mode", {
    sessionId,
    presentationMode,
    currentView,
    floatingState,
    viewState,
    hasActiveFloatingChat,
    activeFloatingChatGroupId,
    activeElementTag: document.activeElement?.tagName ?? null,
  });

  const transcriptColumnWidth = isActiveTranscriptSession
    ? FLOATING_DOCK_LAYOUT.transcriptRecordingWidth
    : FLOATING_DOCK_LAYOUT.transcriptCollapsedSize;
  const formatElapsed = () => {
    const mins = Math.floor(elapsedMinutes);
    const secs = Math.floor((elapsedMinutes % 1) * 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const transcriptEntry = (
    <FloatingTranscriptEntry
      isRecording={isActiveTranscriptSession}
      isPaused={ongoingSession.status === "running_paused"}
      hasTranscript={hasTranscript}
      elapsedLabel={formatElapsed()}
      onOpen={() => openFloating("transcript")}
      onPauseResume={() => {
        if (ongoingSession.status === "running_active") {
          ongoingSession.pause();
        } else if (ongoingSession.status === "running_paused") {
          ongoingSession.resume();
        } else if (!useAudioUploadStore.getState().isProcessing()) {
          ongoingSession.start(sessionId);
        }
      }}
      onStop={() => ongoingSession.stop()}
    />
  );

  const chatEntry = (
    <FloatingDock
      mode={isChatFocused ? "composing" : "idle"}
      draftPrompt={draft}
      onDraftChange={setDraft}
      onFocusCompose={() => {
        const msSinceClose = lastShellCloseAtRef.current == null
          ? null
          : Date.now() - lastShellCloseAtRef.current;

        if (msSinceClose != null && msSinceClose < 150) {
          logFloating("suppress_dock_focus_after_close", {
            sessionId,
            activeFloatingChatGroupId,
            msSinceClose,
          });
          return;
        }

        if (!draft.trim() && hasActiveFloatingChat && hasActiveFloatingChatMessages) {
          logFloating("resume_existing_chat_from_dock", {
            sessionId,
            activeFloatingChatGroupId,
            currentView,
            floatingState,
          });
          switchView("chat");
          openFloating("chat");
          return;
        }

        logFloating("focus_compose", {
          draftLength: draft.trim().length,
          currentView,
          floatingState,
          previousViewState: viewState,
        });
        openComposer();
        switchView("chat");
        collapseFloating();
      }}
      onCollapseIfEmpty={collapseComposer}
      onSubmit={handleSubmitToThread}
      onQuickAction={(prompt) => {
        if (!sessionId) {
          logFloating("quick_action_blocked_no_session", {
            promptLength: prompt.length,
          });
          return;
        }

        logFloating("queue_quick_action", {
          sessionId,
          promptLength: prompt.length,
        });
        openFloating("chat", { focus: false });
        queueFloatingPrompt(sessionId, prompt);
        clearChatDraft(sessionId);
        closeToIdle();
      }}
      onOpenHistory={handleOpenHistory}
      onMoveToSidebar={handleMoveToSidebar}
      onMinimize={collapseComposer}
      hasHistory={hasHistory}
      embedded
    />
  );

  if (isTranscriptExpanded || isChatExpanded) {
    const handleClose = () => {
      logFloating("close_shell", {
        currentView,
        floatingState,
        viewState,
        draftLength: draft.trim().length,
      });
      lastShellCloseAtRef.current = Date.now();
      collapseFloating();
      if (currentView === "chat" && !draft.trim()) {
        collapseComposer();
      }
    };

    const handleBackdropWheel = (e: React.WheelEvent) => {
      const editorArea = document.getElementById(`editor-area-${sessionId}`);
      if (editorArea) {
        editorArea.scrollTop += e.deltaY;
      }
    };

    return (
      <>
        {
          /* Backdrop — transparent, same z-index as shell but earlier in DOM so it sits behind.
            pointer-events-auto captures clicks in the empty space outside the shell. */
        }
        <div
          className="fixed inset-0 z-20 pointer-events-auto"
          onClick={handleClose}
          onWheel={handleBackdropWheel}
          aria-hidden="true"
        />
        <div className={FLOATING_DOCK_POSITION_CLASS}>
          <div className={cn("w-full", FLOATING_DOCK_LAYOUT.railMaxWidthClass)}>
            <FloatingAssistantShell
              view={isTranscriptActive ? "transcript" : "chat"}
              noteTitle={noteTitle}
              onClose={handleClose}
              onMoveToSidebar={handleMoveToSidebar}
              pendingShowHistory={pendingShowHistory}
              onPendingShowHistoryConsumed={() => setPendingShowHistory(false)}
            />
          </div>
        </div>
      </>
    );
  }

  if (isChatFocused) {
    const handleBackdropWheel = (e: React.WheelEvent) => {
      const editorArea = document.getElementById(`editor-area-${sessionId}`);
      if (editorArea) {
        editorArea.scrollTop += e.deltaY;
      }
    };

    return (
      <>
        <div
          className="fixed inset-0 z-10 pointer-events-auto"
          onClick={collapseComposer}
          onWheel={handleBackdropWheel}
          aria-hidden="true"
        />
        <FloatingAssistantRail
          transcriptEntry={transcriptEntry}
          chatEntry={chatEntry}
          transcriptColumnWidth={transcriptColumnWidth}
          showTranscriptEntry={false}
        />
      </>
    );
  }

  return (
    <FloatingAssistantRail
      transcriptEntry={transcriptEntry}
      chatEntry={chatEntry}
      transcriptColumnWidth={transcriptColumnWidth}
      showTranscriptEntry={!isChatFocused}
    />
  );
}
