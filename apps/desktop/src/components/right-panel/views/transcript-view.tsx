import { useAudioUpload } from "@/contexts/audio-upload";
import { useAudioUploadStore } from "@/stores/audio-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMatch } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TranscriptActionBar } from "../../transcript/actions/TranscriptActionBar";
import type { TranscriptState } from "../../transcript/hooks/useTranscriptState";

import { useTypr } from "@/contexts";
import { useModelState } from "@/hooks/useModelState";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands, Word } from "@typr/plugin-db";
import { commands as localSttCommands } from "@typr/plugin-local-stt";

import TranscriptEditor, { type SpeakerViewInnerProps, type TranscriptEditorRef } from "@typr/tiptap/transcript";

import { AISetupIndicator } from "@/components/ui/ai-setup-indicator";
import { AnimatedIconDisplay, BUTTON_VARIANTS, CONTENT_VARIANTS } from "@/components/ui/animated-icon-display";
import { Loader } from "@/components/ui/loader";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useRecordingTimer } from "@/hooks/useRecordingTimer";
import { cn } from "@/lib/utils";
import { Button } from "@typr/ui/components/ui/button";
import { Spinner } from "@typr/ui/components/ui/spinner";
import { useOngoingSession } from "@typr/utils/contexts";
import { STTLanguageSelector } from "../../transcript/actions/STTLanguageSelector";
import { LANGUAGE_OPTIONS, type LanguageOption } from "../../transcript/constants/languageData";
import { useSTTModel } from "../../transcript/hooks/useSTTModel";
import { SearchHeader } from "../components/search";
import { useTranscriptWidget } from "../hooks/useTranscriptWidget";
import { shouldPersistTranscriptUpdate } from "./transcript-persistence";

function useContainerWidth(ref: React.RefObject<HTMLElement>) {
  const [width, setWidth] = useState(0);
  const [lastVisibleWidth, setLastVisibleWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measured = element.getBoundingClientRect().width;
    setWidth(measured);
    if (measured > 0) {
      setLastVisibleWidth(measured);
    }
  }, [ref]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const measured = entry.contentRect.width;
        setWidth(measured);
        if (measured > 0) {
          setLastVisibleWidth(measured);
        }
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return width > 0 ? width : lastVisibleWidth;
}

const shortSessionId = (id: string | null | undefined) => id?.slice(-8) ?? "none";

function hasActiveTextSelectionWithin(element: HTMLElement | null) {
  if (!element) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
    return false;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  return (!!anchorNode && element.contains(anchorNode)) || (!!focusNode && element.contains(focusNode));
}

export function TranscriptView({
  showTabs = true,
  layout = "sidebar",
  onClose,
  onMoveToSidebar,
}: {
  showTabs?: boolean;
  layout?: "sidebar" | "floating";
  onClose?: () => void;
  onMoveToSidebar?: () => void;
} = {}) {
  const { t } = useLingui();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<TranscriptEditorRef | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const sessionId = noteMatch?.params.id ?? null;
  currentSessionIdRef.current = sessionId;

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => dbCommands.getSession({ id: sessionId! }),
    enabled: !!sessionId,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const ongoingSession = useOngoingSession((s) => ({
    sessionId: s.sessionId,
    start: s.start,
    status: s.status,
    loading: s.loading,
    isInactive: s.status === "inactive",
    isActive: s.status === "running_active",
    isPaused: s.status === "running_paused",
  }));
  const { showEmptyMessage, hasTranscript, isLive, words } = useTranscriptWidget(sessionId);
  const { remaining, isWarning, isDanger, shouldShowTimer } = useRecordingTimer();
  const transcriptState = useMemo<TranscriptState>(() => {
    if (showEmptyMessage && ongoingSession.isInactive) {
      return "empty";
    }

    if (
      sessionId === ongoingSession.sessionId
      && (ongoingSession.isActive || ongoingSession.isPaused)
    ) {
      return "active";
    }

    if (hasTranscript && sessionId && ongoingSession.isInactive) {
      return "stopped";
    }

    return "empty";
  }, [
    showEmptyMessage,
    ongoingSession.isInactive,
    ongoingSession.isActive,
    ongoingSession.isPaused,
    ongoingSession.sessionId,
    hasTranscript,
    sessionId,
  ]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const unlisteners: (() => void)[] = [];

    listen("session-event", (event: any) => {
      const payload = event.payload;

      if (payload.type === "transcriptProcessing" && payload.session_id === sessionId) {
        toast.loading(t`Enhancing transcript with speaker labels...`, {
          id: "speaker-processing",
          duration: Infinity,
        });
      } else if (payload.type === "transcriptUpdated" && payload.session_id === sessionId) {
        toast.success(t`Speaker labels added`, {
          id: "speaker-processing",
        });

        queryClient.invalidateQueries({
          queryKey: ["session", "words", sessionId],
        });
        queryClient.invalidateQueries({
          queryKey: ["session", sessionId],
        });
      } else if (payload.type === "transcriptError" && payload.session_id === sessionId) {
        toast.error(t`Failed to add speaker labels`, {
          id: "speaker-processing",
        });
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [sessionId, queryClient, t]);

  useEffect(() => {
    // Sync editor content when words change within the same session
    // (live transcription, upload completion, speaker label updates).
    // Session *switches* are handled by key={sessionId} which remounts the editor.
    if (!editorRef.current) {
      return;
    }
    // Defer setContent to avoid flushSync-inside-lifecycle warning from TipTap.
    const syncSessionId = sessionId;
    queueMicrotask(() => {
      if (currentSessionIdRef.current !== syncSessionId) {
        debugLogFor(
          "DEBUG_TRANSCRIPT",
          "TranscriptView",
          `sync skipped staleTask=${shortSessionId(syncSessionId)} current=${
            shortSessionId(currentSessionIdRef.current)
          }`,
        );
        return;
      }

      if (isLive && hasActiveTextSelectionWithin(containerRef.current)) {
        debugLogFor(
          "DEBUG_TRANSCRIPT",
          "TranscriptView",
          `sync skipped activeSelection route=${shortSessionId(syncSessionId)} words=${words?.length ?? 0}`,
        );
        return;
      }

      editorRef.current?.setWords(words ?? []);

      if (isLive && !editorRef.current?.editor?.isFocused) {
        editorRef.current?.scrollToBottom();
      }
    });
  }, [words, isLive, sessionId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        const currentShowActions = hasTranscript && sessionId && ongoingSession.isInactive;
        if (currentShowActions) {
          setIsSearchActive(true);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasTranscript, sessionId, ongoingSession.isInactive]);

  const handleUpdate = useCallback((words: Word[]) => {
    // key={sessionId} on TranscriptEditor guarantees the editor instance
    // is always scoped to the correct session — no stale cross-session writes.
    if (
      !shouldPersistTranscriptUpdate({
        isLive,
        routeSessionId: sessionId,
        currentSessionId: currentSessionIdRef.current,
      })
    ) {
      debugLogFor(
        "DEBUG_TRANSCRIPT",
        "TranscriptView",
        `persist skipped route=${shortSessionId(sessionId)} current=${
          shortSessionId(currentSessionIdRef.current)
        } live=${isLive} words=${words.length}`,
      );
      return;
    }

    debugLogFor(
      "DEBUG_TRANSCRIPT",
      "TranscriptView",
      `persist requested route=${shortSessionId(sessionId)} current=${
        shortSessionId(currentSessionIdRef.current)
      } words=${words.length}`,
    );
    dbCommands.getSession({ id: sessionId! }).then((session) => {
      if (session) {
        debugLogFor(
          "DEBUG_TRANSCRIPT",
          "TranscriptView",
          `persist applying dbSession=${shortSessionId(session.id)} route=${
            shortSessionId(sessionId)
          } words=${words.length}`,
        );
        dbCommands.upsertSession({ ...session, words }).then(() => {
          queryClient.invalidateQueries({
            queryKey: ["session", "words", sessionId],
          });
        });
      }
    });
  }, [isLive, sessionId, queryClient]);

  if (!noteMatch || !sessionId) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-muted-foreground text-center">
          <Trans>Please open a note to view its transcription.</Trans>
        </p>
      </div>
    );
  }

  if (sessionQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">
            <Trans>Loading transcription...</Trans>
          </p>
        </div>
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">
            <Trans>Failed to load transcription</Trans>
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            {sessionQuery.error?.message || <Trans>Unable to access session data</Trans>}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sessionQuery.refetch()}
            disabled={sessionQuery.isFetching}
          >
            {sessionQuery.isFetching ? <Spinner className="w-4 h-4" /> : <Trans>Retry</Trans>}
          </Button>
        </div>
      </div>
    );
  }

  if (!sessionQuery.data) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-muted-foreground text-center">
          Session not found. Please try refreshing the app.
        </p>
      </div>
    );
  }

  const SpeakerComponent = SpeakerLabel;

  const formatTime = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="w-full h-full flex flex-col" ref={containerRef}>
      {isSearchActive && (
        <SearchHeader
          target={{
            type: "editor",
            editorRef: editorRef,
          }}
          onClose={() => setIsSearchActive(false)}
          placeholder={t`Find`}
          hasReplace={true}
        />
      )}

      <TranscriptActionBar
        sessionId={sessionId}
        panelWidth={containerRef.current?.getBoundingClientRect().width ?? 400}
        editorRef={editorRef}
        onSearchToggle={setIsSearchActive}
        isSearchActive={isSearchActive}
        transcriptState={transcriptState}
        isLanguageChangeable={ongoingSession.isInactive}
        showTabs={showTabs}
        layout={layout}
        onClose={onClose}
        onMoveToSidebar={onMoveToSidebar}
      />

      <AISetupIndicator />

      <div className="flex-1 overflow-hidden flex flex-col">
        {showEmptyMessage
          ? <RenderEmpty sessionId={sessionId} containerRef={containerRef} layout={layout} />
          : (
            <>
              {isLive && words.length === 0 && (
                <div
                  className={layout === "floating"
                    ? "mx-3 mt-3 mb-2 rounded-xl bg-muted/30 px-3.5 py-2.5 backdrop-blur-sm shadow-sm"
                    : "mx-4 mt-4 mb-3 px-4 py-3 bg-muted/30 backdrop-blur-sm rounded-xl shadow-sm"}
                >
                  <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-3 font-medium">
                    <Loader variant="wave" size="sm" />
                    <Trans>Listening. Text appears after speech pauses.</Trans>
                  </div>
                </div>
              )}
              <div className="relative flex-1 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-4 pointer-events-none z-[5]">
                  <div className="absolute inset-0 bg-gradient-to-b from-muted/65 via-muted/35 to-muted/0" />
                </div>

                <TranscriptEditor
                  key={sessionId}
                  ref={editorRef}
                  initialWords={words}
                  editable={ongoingSession.isInactive}
                  onUpdate={handleUpdate}
                  c={SpeakerComponent}
                />

                <div className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-[5]">
                  <div className="absolute inset-0 backdrop-opacity-75 bg-gradient-to-t from-background/65 via-background/35 to-transparent" />
                </div>
              </div>

              {shouldShowTimer && (
                <div className="flex flex-col items-center gap-2 py-3 pb-4">
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-lg backdrop-blur-sm shadow-sm border transition-all text-xs font-medium",
                      !isWarning && "bg-background/80 text-foreground/70 border-border/30",
                      isWarning && !isDanger && "bg-warning/10 text-warning border-warning/30",
                      isDanger && "bg-destructive/5 text-destructive border-destructive/30",
                    )}
                  >
                    <i
                      className={cn(
                        "ri-timer-line text-sm",
                        !isWarning && "text-muted-foreground",
                        isWarning && !isDanger && "text-warning",
                        isDanger && "text-destructive",
                      )}
                    />
                    <span>
                      {formatTime(remaining)} <Trans>remaining</Trans>
                    </span>
                  </div>

                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function UploadAudioButton({ sessionId, disabled }: { sessionId: string; disabled: boolean }) {
  const { openAudioUpload } = useAudioUpload();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => openAudioUpload(sessionId)}
      disabled={disabled}
      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <i className="ri-upload-2-line text-sm" />
      <Trans>Upload audio file</Trans>
    </Button>
  );
}

function RenderEmpty({ sessionId, containerRef, layout }: {
  sessionId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  layout?: string;
}) {
  const { t } = useLingui();
  const { thankYouSessionId } = useTypr();
  const ongoingSession = useOngoingSession((s) => ({
    start: s.start,
    status: s.status,
    loading: s.loading,
  }));

  const panelWidth = useContainerWidth(containerRef);
  const isOnboardingSession = sessionId === thankYouSessionId;
  const { models } = useModelState();
  const isUploadProcessing = useAudioUploadStore((s) => s.progress.status === "processing");
  const { selectedLanguage, handleLanguageChange, isChanging } = useSTTModel();

  const supportedModelsQuery = useQuery({
    queryKey: ["supported-stt-models"],
    queryFn: () => localSttCommands.listSupportedModels(),
    staleTime: 60 * 1000,
  });

  const selectedSttModelQuery = useQuery({
    queryKey: ["stt-model-connector"],
    queryFn: () => connectorCommands.getSttModel(),
    staleTime: 5 * 1000,
  });

  const anyModelDownloaded = {
    data: (() => {
      const hasLocalDownloaded =
        supportedModelsQuery.data?.some(model => models.find(m => m.id === model.toString())?.isDownloaded || false)
        || false;

      const hasCloudSelected = (selectedSttModelQuery.data && selectedSttModelQuery.data.includes("assemblyai"))
        || false;

      return hasLocalDownloaded || hasCloudSelected;
    })(),
    isLoading: supportedModelsQuery.isLoading || selectedSttModelQuery.isLoading,
  };

  const handleStartRecording = () => {
    if (isUploadProcessing) {
      return;
    }
    if (ongoingSession.status === "inactive" && anyModelDownloaded.data) {
      ongoingSession.start(sessionId);
    }
  };

  const isUltraCompact = panelWidth < 150;
  const selectedModel = LANGUAGE_OPTIONS.find((option) => option.key === selectedLanguage);
  const selectedModelSource = selectedModel && "isCloud" in selectedModel && selectedModel.isCloud
    ? t`Cloud`
    : t`On-device`;

  const getSelectedModelLabel = (key: LanguageOption) => {
    switch (key) {
      case "balanced":
        return t`Multilingual`;
      case "english":
        return t`English high accuracy`;
      case "assemblyai-universal":
        return t`Real-time multilingual`;
      default:
        return key;
    }
  };

  return (
    <motion.div
      className="group flex-1 flex flex-col items-center justify-center h-full px-8 py-6 text-center"
      initial="initial"
      animate="animate"
      whileHover="hover"
    >
      <div className="mb-4">
        <AnimatedIconDisplay
          icons={[
            <i className="ri-mic-ai-line text-lg" />,
            <i className="ri-voiceprint-line text-lg" />,
            <i className="ri-file-text-line text-lg" />,
          ]}
        />
      </div>

      <motion.div variants={CONTENT_VARIANTS} className="mb-5">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          <Trans>Start a transcription</Trans>
        </h2>
        <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
          <Trans>
            Convert your audio to text in real-time.
          </Trans>
        </p>
      </motion.div>

      {!isUltraCompact && (
        <motion.div
          variants={BUTTON_VARIANTS}
          className="mb-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">
            {selectedModel ? getSelectedModelLabel(selectedModel.key) : <Trans>Transcription model</Trans>}
          </span>
          <span>·</span>
          <span>{selectedModelSource}</span>
          <span>·</span>
          <STTLanguageSelector
            value={selectedLanguage}
            onChange={handleLanguageChange}
            disabled={isChanging || ongoingSession.status !== "inactive"}
            size="compact"
            triggerLabel={t`Change`}
            triggerVariant="inline"
          />
        </motion.div>
      )}

      <motion.div variants={BUTTON_VARIANTS}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="default"
              onClick={isUploadProcessing ? undefined : handleStartRecording}
              disabled={ongoingSession.loading || !anyModelDownloaded.data || isOnboardingSession || isUploadProcessing}
              className={`${isUltraCompact ? "px-3" : "px-6"} mb-3 gap-2`}
              title={isUltraCompact
                ? (
                  isUploadProcessing
                    ? t`Audio upload in progress`
                    : isOnboardingSession
                    ? t`Try the demo video above first!`
                    : ongoingSession.loading
                    ? t`Starting...`
                    : !anyModelDownloaded.data
                    ? t`Download a model first`
                    : t`Start transcribing`
                )
                : undefined}
            >
              {ongoingSession.loading ? <Spinner color="white" /> : (
                <div className="relative h-2 w-2">
                  <div className="absolute inset-0 rounded-full bg-destructive"></div>
                  {!isUploadProcessing && (
                    <div className="absolute inset-0 rounded-full bg-destructive/80 animate-ping"></div>
                  )}
                </div>
              )}
              {!isUltraCompact && (
                <span>
                  {ongoingSession.loading ? <Trans>Initializing model...</Trans> : <Trans>Start transcribing</Trans>}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          {isUploadProcessing && (
            <PopoverContent side="bottom" className="w-auto max-w-[240px] p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <i className="ri-loader-4-line animate-spin shrink-0" />
                <Trans>Audio upload in progress. Live transcription is unavailable until it finishes.</Trans>
              </div>
            </PopoverContent>
          )}
        </Popover>
      </motion.div>

      {!isUltraCompact && !isOnboardingSession && layout !== "floating" && (
        <motion.div variants={BUTTON_VARIANTS} className="flex flex-col items-center gap-2">
          <UploadAudioButton sessionId={sessionId} disabled={false} />
        </motion.div>
      )}

      <motion.p variants={BUTTON_VARIANTS} className="text-xs text-muted-foreground/70">
        {isOnboardingSession
          ? <Trans>Watch the demo video above to see how Typr transcription works!</Trans>
          : anyModelDownloaded.data === false
          ? <Trans>Download a transcription model above to begin</Trans>
          : ongoingSession.loading
          ? <Trans>Loading AI model into memory... This may take a few seconds on first start</Trans>
          : null}
      </motion.p>
    </motion.div>
  );
}

const SpeakerLabel = ({ speakerIndex, speakerId }: SpeakerViewInnerProps) => {
  const { i18n } = useLingui();
  const label = speakerIndex === 0 || speakerId === "you" ? i18n._("You") : i18n._("Them");
  return (
    <span className="font-medium text-foreground text-xs">
      {label}
    </span>
  );
};
