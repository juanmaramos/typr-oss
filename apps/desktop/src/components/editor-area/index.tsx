import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import usePreviousValue from "beautiful-react-hooks/usePreviousValue";
import { diffWords } from "diff";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debugLogFor } from "@/components/utils/debug-logger";
import { useTypr, useRightPanel } from "@/contexts";
import { resolveNoteTitle } from "@/lib/note-title";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { extractTextFromHtml } from "@/utils/parse";
import { TemplateService } from "@/utils/template-service";
import { commands as configCommands } from "@typr/plugin-config";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands } from "@typr/plugin-db";
import { commands as miscCommands } from "@typr/plugin-misc";
import { commands as templateCommands, type Grammar } from "@typr/plugin-template";
import Editor, { type TiptapEditor, type TiptapEditorHandle } from "@typr/tiptap/editor";
import Renderer from "@typr/tiptap/renderer";
import { extractHashtags } from "@typr/tiptap/shared";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { CLOUD_GENERATION_TOKEN_BUDGETS } from "@typr/utils";

// Global registry for editors to enable access from other components
declare global {
  interface Window {
    __TYPR_EDITORS__?: Record<string, TiptapEditorHandle>;
  }
}
import { useAgentWritingFeature } from "@/hooks/use-agent-writing-feature";
import { useSelectionContext } from "@/stores/useSelectionContext";
import {
  generateText,
  getTemplateTypeForTask,
  localProviderName,
  markdownTransform,
  modelProvider,
  smoothStream,
  streamText,
} from "@typr/utils/ai";
import { useOngoingSession, useSession, useSessions } from "@typr/utils/contexts";
import { SearchHeader } from "../right-panel/components/search/search-header";
import { enhanceFailedToast } from "../toast/shared";

import { NOTE_WORKSPACE_COLUMN_CLASS, NOTE_WORKSPACE_COLUMN_STYLE } from "./layout";
import { NoteHeader, type NoteViewTab } from "./note-header";
import { SelectionActions } from "./selection-actions";
import { WritingBarOverlay } from "./writing-bar-overlay";

const STREAM_FLUSH_INTERVAL_MS = 100;
const BOTTOM_FOLLOW_THRESHOLD_PX = 96;

function getEditorScrollContainer(sessionId: string): HTMLElement | null {
  return document.getElementById(`editor-area-${sessionId}`);
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_FOLLOW_THRESHOLD_PX;
}

function restoreStreamingScroll(element: HTMLElement | null, shouldFollowBottom: boolean, previousScrollTop: number) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    if (shouldFollowBottom) {
      element.scrollTop = element.scrollHeight;
    } else {
      element.scrollTop = previousScrollTop;
    }
  });
}

function getScrollDebugSnapshot(element: HTMLElement | null) {
  if (!element) {
    return null;
  }

  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

  return {
    scrollTop: Math.round(element.scrollTop),
    scrollHeight: Math.round(element.scrollHeight),
    clientHeight: Math.round(element.clientHeight),
    distanceFromBottom: Math.round(distanceFromBottom),
    nearBottom: distanceFromBottom <= BOTTOM_FOLLOW_THRESHOLD_PX,
  };
}

async function generateTitleDirect(enhancedContent: string, targetSessionId: string, sessions: Record<string, any>) {
  try {
    const [config, provider, templateType] = await Promise.all([
      dbCommands.getConfig(),
      modelProvider(undefined, { includeOnboardingModel: false, task: "meetingSummary" }),
      getTemplateTypeForTask("meetingSummary"),
    ]);
    const isLocalLlm = templateType === "TyprLocal";

    const [systemMessage, userMessage] = await Promise.all([
      templateCommands.render("create_title.system", { config, type: templateType }),
      templateCommands.render("create_title.user", { type: templateType, enhanced_note: enhancedContent }),
    ]);

    const model = provider.languageModel("defaultModel");
    const abortSignal = AbortSignal.timeout(60_000);

    const { text } = await generateText({
      abortSignal,
      model,
      maxTokens: CLOUD_GENERATION_TOKEN_BUDGETS.title,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      ...(isLocalLlm && {
        providerOptions: {
          [localProviderName]: {
            metadata: {
              grammar: { task: "title" } satisfies Grammar,
            },
          },
        },
      }),
    });

    // Get current session from database
    const session = await dbCommands.getSession({ id: targetSessionId });
    if (!session) {
      console.warn(`[TitleGen] Session ${targetSessionId} not found in database`);
      return;
    }

    // Allow title generation for sessions without titles OR YouTube sessions (which should get AI-generated titles)
    const shouldGenerateTitle = !session.title || session.source_type === "youtube";

    if (!shouldGenerateTitle) {
      return;
    }

    const resolvedTitle = resolveNoteTitle({
      generatedTitle: text,
      enhancedContent,
      existingTitle: session.title,
    });

    if (!resolvedTitle) {
      console.warn("[TitleGen] Generated title was unusable and no fallback was available", { rawTitle: text });
      return;
    }

    // Update database directly (source of truth)
    await dbCommands.upsertSession({
      ...session,
      title: resolvedTitle.title,
    });

    if (resolvedTitle.source !== "generated") {
      console.warn("[TitleGen] Replaced unusable generated title with fallback", {
        rawTitle: text,
        fallbackSource: resolvedTitle.source,
        fallbackTitle: resolvedTitle.title,
      });
    }

    // Refresh store from DB to pick up the title (and preserve all other DB fields).
    // Using refresh() instead of updateTitle() avoids triggering persistSession(),
    // which could merge stale store data back over correct DB data.
    const sessionStore = sessions[targetSessionId];
    if (sessionStore) {
      await sessionStore.getState().refresh();
    }
  } catch (error) {
    console.error("[TitleGen] Failed to generate title:", error);
    // Don't throw - title generation is non-critical
  }
}

const DISALLOWED_XML_TAGS_GLOBAL_RE =
  /<\s*\/?\s*(raw_note|transcript|participants|instructions|task|template|user_headers)\b[^>]*>/gi;
const DISALLOWED_XML_TAGS_TEST_RE =
  /<\s*\/?\s*(raw_note|transcript|participants|instructions|task|template|user_headers)\b[^>]*>/i;

function stripDisallowedXmlTags(input: string): string {
  return input.replace(DISALLOWED_XML_TAGS_GLOBAL_RE, "").trim();
}

const AI_GENERATION_MIN_WORDS = import.meta.env.DEV ? 5 : 50;

function getSummaryValidationIssues(markdown: string): string[] {
  const issues: string[] = [];

  if (!markdown.trim()) {
    issues.push("empty_output");
  }

  if (DISALLOWED_XML_TAGS_TEST_RE.test(markdown)) {
    issues.push("contains_disallowed_xml_tags");
  }

  if (/```/.test(markdown)) {
    issues.push("contains_code_fence");
  }

  const hasPipeRows = /^\s*\|.*\|\s*$/m.test(markdown);
  if (hasPipeRows) {
    issues.push("contains_markdown_table");
  }

  if (!/^#\s+\S+/m.test(markdown)) {
    issues.push("missing_h1_header");
  }

  if (!/^\s*[-*+]\s+\S+/m.test(markdown)) {
    issues.push("missing_bullets");
  }

  if (/\b(you said|you mentioned|them said|them mentioned|speaker\s*\d+)\b/i.test(markdown)) {
    issues.push("invalid_speaker_attribution");
  }

  return issues;
}

async function repairSummaryMarkdown({
  model,
  markdown,
  summaryLanguage,
  abortSignal,
}: {
  model: any;
  markdown: string;
  summaryLanguage: string;
  abortSignal: AbortSignal;
}): Promise<string> {
  const repairSystemPrompt = `You repair meeting summaries to satisfy strict production formatting requirements.
Never add or invent facts. Preserve meaning and factual content exactly as provided.

Hard constraints:
- Entire response must be in ${summaryLanguage}.
- Output pure markdown only (no XML tags, no code fences).
- Use at least one H1 heading and hyphen bullet lists that start with "- ".
- Do not use markdown tables.
- Do not use "You" or "Them" or "Speaker" style attribution.`;

  const repairUserPrompt =
    `Rewrite this summary so it fully complies with the constraints while preserving factual content:

${markdown}`;

  const { text } = await generateText({
    abortSignal,
    model,
    maxTokens: CLOUD_GENERATION_TOKEN_BUDGETS.meetingNoteRepair,
    messages: [
      { role: "system", content: repairSystemPrompt },
      { role: "user", content: repairUserPrompt },
    ],
  });

  return stripDisallowedXmlTags(text);
}

export default function EditorArea({
  editable,
  sessionId,
}: {
  editable: boolean;
  sessionId: string;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { showSidebar } = useRightPanel();
  const [showRaw, setShowRaw] = useSession(sessionId, (s) => [s.showRaw, s.setShowRaw]);
  const { userId } = useTypr();
  const { setSelection } = useSelectionContext();

  // Check if agent writing feature is enabled
  const isAgentWritingEnabled = useAgentWritingFeature();

  const [rawContent, setRawContent] = useSession(sessionId, (s) => [
    s.session?.raw_memo_html ?? "",
    s.updateRawNote,
  ]);
  const hashtags = useMemo(() => extractHashtags(rawContent), [rawContent]);

  const [enhancedContent, setEnhancedContent] = useSession(sessionId, (s) => [
    s.session?.enhanced_memo_html ?? "",
    s.updateEnhancedNote,
  ]);
  const snapshotAutoEnhanced = useSession(sessionId, (s) => s.snapshotAutoEnhanced);
  const restoreAutoEnhanced = useSession(sessionId, (s) => s.restoreAutoEnhanced);
  const hasAiNotes = useMemo(
    () => extractTextFromHtml(enhancedContent).trim().length > 0,
    [enhancedContent],
  );

  const [activeTab, setActiveTab] = useState<NoteViewTab>(() => (showRaw ? "private" : "ai"));
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const templateInitializedRef = useRef(false);

  const editorRef = useRef<TiptapEditorHandle>(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const editorKey = useMemo(
    () => `session-${sessionId}-${showRaw ? "raw" : "enhanced"}`,
    [sessionId, showRaw],
  );

  // Track the actual editor instance in state (not ref) for reactive updates
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);

  // Register editor instance in global registry immediately when available
  useEffect(() => {
    // Initialize global registry if it doesn't exist
    if (typeof window !== "undefined" && !window.__TYPR_EDITORS__) {
      window.__TYPR_EDITORS__ = {};
    }

    // Poll for editor until it's available (handles race conditions)
    const checkEditor = () => {
      const editor = editorRef.current?.editor;
      if (editor && window.__TYPR_EDITORS__ && editorRef.current) {
        window.__TYPR_EDITORS__[sessionId] = editorRef.current;
        setEditorInstance(editor);
        debugLogFor("DEBUG_EDITOR", "EditorDebug", "registered editor", { sessionId });
      }
    };

    // Check immediately
    checkEditor();

    // Also check after a brief delay to catch late initialization
    const timeoutId = setTimeout(checkEditor, 100);

    return () => {
      clearTimeout(timeoutId);
      // Clean up when component unmounts
      if (window.__TYPR_EDITORS__ && window.__TYPR_EDITORS__[sessionId]) {
        debugLogFor("DEBUG_EDITOR", "EditorDebug", "unregistered editor", { sessionId });
        delete window.__TYPR_EDITORS__[sessionId];
      }
    };
  }, [sessionId, editorKey]); // Re-run when editor key changes (switching between raw/enhanced)

  // Focus-based Cmd+F search handler to avoid conflicts with transcript search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        // Only handle if this editor is focused to avoid conflicts with transcript search
        const editorElement = editorRef.current?.editor?.view.dom;
        if (
          editorElement && (
            document.activeElement === editorElement
            || editorElement.contains(document.activeElement as Node)
          )
        ) {
          e.preventDefault();
          setIsSearchActive(true);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Query to get config for selected template ID
  const configQuery = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
  });

  // Query for popover templates (favorites or defaults)
  const popoverTemplatesQuery = useQuery({
    queryKey: ["templates", "popover", configQuery.data?.selected_template_id],
    queryFn: () => TemplateService.getTemplatesForPopover(configQuery.data?.selected_template_id),
    refetchOnWindowFocus: false,
    staleTime: 60000, // Templates change infrequently
    enabled: !!configQuery.data, // Only run when config is loaded
  });

  // Initialize default favorites on component mount
  useEffect(() => {
    TemplateService.initializeDefaultFavorites();
  }, []);

  useEffect(() => {
    if (configQuery.data && !templateInitializedRef.current) {
      templateInitializedRef.current = true;
      setPendingTemplateId(configQuery.data.selected_template_id ?? null);
    }
  }, [configQuery.data]);

  const preMeetingNote = useSession(sessionId, (s) => s.session.pre_meeting_memo_html) ?? "";
  const hasTranscriptWords = useSession(sessionId, (s) => s.session.words.length > 0);
  const sourceType = useSession(sessionId, (s) => s.session.source_type);

  const llmConnectionQuery = useQuery({
    queryKey: ["llm-connection"],
    queryFn: () => connectorCommands.getLlmConnection(),
    refetchOnWindowFocus: false, // Reduce unnecessary polling
    staleTime: 30000, // Cache for 30 seconds
    retry: 1, // Reduce retry attempts
  });

  const sessionsStore = useSessions((s) => s.sessions);

  const { enhance, cancel: cancelEnhance, isEnhancing, streamingPhase } = useEnhanceMutation({
    sessionId,
    preMeetingNote,
    rawContent,
    isLocalLlm: llmConnectionQuery.data?.type === "TyprLocal",
    onAutoEnhanceSnapshot: snapshotAutoEnhanced,
    onSuccess: (content) => {
      if (hasTranscriptWords) {
        // Fire-and-forget title generation (errors are logged internally)
        generateTitleDirect(content, sessionId, sessionsStore);
      }
    },
  });

  useAutoEnhance({
    sessionId,
    enhanceStatus: enhance.status,
    enhanceMutate: enhance.mutate,
  });

  const handleChangeNote = useCallback(
    (content: string) => {
      if (showRaw) {
        setRawContent(content);
      } else {
        setEnhancedContent(content);
      }
    },
    [showRaw, setRawContent, setEnhancedContent],
  );

  const noteContent = useMemo(
    () => (showRaw ? rawContent : enhancedContent),
    [showRaw, enhancedContent, rawContent],
  );

  useEffect(() => {
    const nextTab: NoteViewTab = showRaw ? "private" : "ai";
    if (activeTab !== nextTab) {
      setActiveTab(nextTab);
    }
  }, [activeTab, showRaw]);

  // If the AI tab is active but there's no AI content and nothing is generating,
  // fall back to the private tab and persist that choice.
  useEffect(() => {
    if (!hasAiNotes && !isEnhancing && activeTab === "ai") {
      setShowRaw(true);
      setActiveTab("private");
    }
  }, [hasAiNotes, isEnhancing, activeTab, setShowRaw]);

  // Auto-switch to AI Notes tab when AI content first arrives for YouTube sessions.
  // Only reacts to the hasAiNotes transition (false → true), not to tab changes,
  // so it never interferes with user-initiated tab switches.
  const prevHasAiNotes = usePreviousValue(hasAiNotes);
  useEffect(() => {
    if (!prevHasAiNotes && hasAiNotes && sourceType === "youtube") {
      setShowRaw(false);
      setActiveTab("ai");
    }
  }, [prevHasAiNotes, hasAiNotes, sourceType, setShowRaw]);

  const saveTemplateSelection = useMutation({
    mutationFn: async (templateId: string | null) => {
      if (!configQuery.data) {
        return;
      }

      await configCommands.setGeneralConfig({
        ...configQuery.data,
        selected_template_id: templateId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["templates", "popover"] });
    },
  });

  const handleTemplateSelect = useCallback((templateId: string) => {
    const nextTemplateId = templateId === "auto" ? null : templateId;
    console.info("[TemplateTrace] select", {
      session_id: sessionId,
      requested_template_id: templateId,
      next_template_id: nextTemplateId,
      has_ai_notes: hasAiNotes,
    });
    setPendingTemplateId(nextTemplateId);
    saveTemplateSelection.mutate(nextTemplateId);

    // Skip inference if there's no AI content yet (nothing to re-template)
    if (!hasAiNotes) {
      return;
    }

    if (nextTemplateId === null) {
      // "Auto" selected — restore the snapshot if available, otherwise regenerate
      const snapshot = restoreAutoEnhanced();
      if (snapshot) {
        setEnhancedContent(snapshot);
        setShowRaw(false);
        setActiveTab("ai");
      } else {
        // No snapshot stored yet — regenerate with auto
        setShowRaw(false);
        setActiveTab("ai");
        enhance.mutate({ templateId: null, triggerType: "auto" });
      }
    } else {
      // Template selected — trigger inference immediately
      setShowRaw(false);
      setActiveTab("ai");
      console.info("[TemplateTrace] select:enhance", {
        session_id: sessionId,
        template_id: nextTemplateId,
      });
      enhance.mutate({ templateId: nextTemplateId, triggerType: "template" });
    }
  }, [sessionId, saveTemplateSelection, hasAiNotes, restoreAutoEnhanced, setEnhancedContent, setShowRaw, enhance]);

  const handleRegenerateAiNotes = useCallback(() => {
    setShowRaw(false);
    setActiveTab("ai");
    enhance.mutate({
      templateId: pendingTemplateId,
      triggerType: pendingTemplateId ? "template" : "manual",
    });
  }, [enhance, pendingTemplateId, setShowRaw]);

  const safelyFocusEditor = useCallback(() => {
    if (editorRef.current?.editor && editorRef.current.editor.isEditable) {
      requestAnimationFrame(() => {
        editorRef.current?.editor?.commands.focus();
      });
    }
  }, []);

  const lastBacklinkSearchTime = useRef<number>(0);

  const handleMentionSearch = async (query: string) => {
    const now = Date.now();
    const timeSinceLastEvent = now - lastBacklinkSearchTime.current;

    if (timeSinceLastEvent >= 5000) {
      safeAnalyticsEvent({
        event: "searched_backlink",
        distinct_id: userId,
      });
      lastBacklinkSearchTime.current = now;
    }

    const session = await dbCommands.listSessions({ type: "search", query, user_id: userId, limit: 5 });

    return session.map((s) => ({
      id: s.id,
      type: "note",
      label: s.title,
    }));
  };

  const handleImproveWriting = useCallback((selectedText: string, range: { from: number; to: number }) => {
    // Track analytics for improve writing feature
    if (userId) {
      safeAnalyticsEvent({
        event: "improve_writing_initiated",
        distinct_id: userId,
        properties: {
          text_length: selectedText.length,
          session_id: sessionId,
        },
      });
    }

    // Store selection in context and trigger chat-based improvement
    setSelection(selectedText, range, sessionId);

    // The actual improvement will be handled by the chat system
    // We'll dispatch a custom event to trigger the chat-based flow
    window.dispatchEvent(
      new CustomEvent("improveWritingRequested", {
        detail: { selectedText, range, sessionId, action: "improve" },
      }),
    );
  }, [setSelection, sessionId, userId]);

  const handleOpenTranscript = useCallback(() => {
    showSidebar("transcript");
  }, [showSidebar]);

  return (
    <div className="relative flex h-full flex-col w-full">
      {/* Search Header - Only shown when search is active */}
      {isSearchActive && (
        <SearchHeader
          target={{ type: "editor", editorRef: editorRef }}
          onClose={() => setIsSearchActive(false)}
          hasReplace={true}
          placeholder={t`Find`}
        />
      )}

      <NoteHeader
        sessionId={sessionId}
        editable={editable}
        onNavigateToEditor={safelyFocusEditor}
        hashtags={hashtags}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === "private") {
            setShowRaw(true);
          } else if (tab === "ai") {
            setShowRaw(false);
          }
        }}
        onOpenTranscript={handleOpenTranscript}
        onRegenerateAiNotes={handleRegenerateAiNotes}
        onTemplateSelect={handleTemplateSelect}
        pendingTemplateId={pendingTemplateId}
        templates={popoverTemplatesQuery.data || []}
        isGeneratingAiNotes={isEnhancing}
        hasAiNotes={hasAiNotes}
      />

      {/* Alternative: StreamingWritingBar - Static banner with state transitions (currently unused) */}
      {/* {isEnhancing && <StreamingWritingBar state="writing" />} */}

      <div
        id={`editor-area-${sessionId}`}
        className={cn([
          "scrollbar-native relative h-full overflow-y-auto",
          enhancedContent && "pb-10",
        ])}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("a[href]")) {
            e.stopPropagation();
            safelyFocusEditor();
          }
        }}
      >
        <div className="pointer-events-none sticky top-0 z-10 h-4 bg-gradient-to-b from-background/70 to-transparent" />
        <div className="px-8 pb-14">
          <div className={cn(NOTE_WORKSPACE_COLUMN_CLASS, "relative")} style={NOTE_WORKSPACE_COLUMN_STYLE}>
            {editable
              ? (
                <Editor
                  key={editorKey}
                  ref={editorRef}
                  handleChange={handleChangeNote}
                  initialContent={noteContent}
                  editable={editable}
                  aiWriting={!showRaw && enhance.status === "pending"}
                  suppressExternalContentSync={!showRaw && enhance.status === "pending"}
                  placeholderText={t`Start taking notes...`}
                  mentionConfig={{
                    trigger: "@",
                    handleSearch: handleMentionSearch,
                  }}
                />
              )
              : <Renderer ref={editorRef} initialContent={noteContent} />}
            <AnimatePresence>
              {isEnhancing && streamingPhase !== "idle" && (
                <WritingBarOverlay
                  sessionId={sessionId}
                  phase={streamingPhase}
                  onCancel={cancelEnhance}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Selection Actions Toolbar */}
      {editable && isAgentWritingEnabled && (
        <SelectionActions
          editor={editorInstance}
          sessionId={sessionId}
          onImproveWriting={handleImproveWriting}
        />
      )}
    </div>
  );
}

export function useEnhanceMutation({
  sessionId,
  preMeetingNote,
  rawContent,
  isLocalLlm,
  onSuccess,
  onAutoEnhanceSnapshot,
}: {
  sessionId: string;
  preMeetingNote: string;
  rawContent: string;
  isLocalLlm: boolean;
  onSuccess: (enhancedContent: string) => void;
  onAutoEnhanceSnapshot: (content: string) => void;
}) {
  const { userId, onboardingSessionId } = useTypr();

  // DRY: Single source of truth for template selection
  const getTemplateKeys = (session: any) => {
    const isYoutube = session?.source_type === "youtube";
    return {
      system: isYoutube ? "enhance_youtube.system" : "enhance.system",
      user: isYoutube ? "enhance_youtube.user" : "enhance.user",
      isYoutube, // For logging
    };
  };
  const [progress, setProgress] = useState(0);
  const [streamingPhase, setStreamingPhase] = useState<"idle" | "starting" | "streaming" | "finishing">("idle");
  const [actualIsLocalLlm, setActualIsLocalLlm] = useState(isLocalLlm);
  const queryClient = useQueryClient();

  // Extract H1 headers at component level (always available)
  const extractH1Headers = useCallback((htmlContent: string): string[] => {
    if (!htmlContent) {
      return [];
    }

    const h1Regex = /<h1[^>]*>(.*?)<\/h1>/gi;
    const headers: string[] = [];
    let match;

    while ((match = h1Regex.exec(htmlContent)) !== null) {
      const headerText = match[1].replace(/<[^>]*>/g, "").trim();
      if (headerText) {
        headers.push(headerText);
      }
    }

    return headers;
  }, []);

  const h1Headers = useMemo(() => extractH1Headers(rawContent), [rawContent, extractH1Headers]);

  const preMeetingText = extractTextFromHtml(preMeetingNote);
  const rawText = extractTextFromHtml(rawContent);

  const finalInput = diffWords(preMeetingText, rawText)
    ?.filter(diff => diff.added && !diff.removed)
    .map(diff => diff.value)
    .join(" ") || "";

  const [enhanceController, setEnhanceController] = useState<AbortController | null>(null);
  const enhanceControllerRef = useRef<AbortController | null>(null);
  const enhanceContextRef = useRef<
    {
      triggerType: "manual" | "template" | "auto";
      startedAtMs: number;
      llmConnectionType: string;
      cloudModel: string | null;
      templateId: string | null;
    } | null
  >(null);
  const enhanceRollbackRef = useRef<{
    sessionId: string;
    enhancedMemoHtml: string | null;
    editorHtml: string | null;
    showRaw: boolean;
  } | null>(null);
  const { persistSession, setEnhancedContent, restoreEnhancedContent } = useSession(sessionId, (s) => ({
    persistSession: s.persistSession,
    setEnhancedContent: s.updateEnhancedNote,
    restoreEnhancedContent: s.restoreEnhancedNote,
  }));

  const restoreEnhanceCheckpoint = useCallback(async (reason: "cancel" | "error" | "superseded") => {
    const checkpoint = enhanceRollbackRef.current;
    if (!checkpoint) {
      return;
    }

    const editorHandle = window.__TYPR_EDITORS__?.[checkpoint.sessionId];
    const htmlToRestore = checkpoint.editorHtml ?? checkpoint.enhancedMemoHtml ?? "";

    editorHandle?.setSuppressChangeHandling(true);
    try {
      editorHandle?.editor?.commands.setContent(htmlToRestore, false);
      await restoreEnhancedContent(checkpoint.enhancedMemoHtml, checkpoint.showRaw);
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "restore_checkpoint", {
        sessionId: checkpoint.sessionId,
        reason,
        restoredChars: htmlToRestore.length,
        hadCommittedSummary: !!checkpoint.enhancedMemoHtml,
      });
    } finally {
      editorHandle?.setSuppressChangeHandling(false);
      enhanceRollbackRef.current = null;
    }
  }, [restoreEnhancedContent]);

  const releaseEnhanceCheckpoint = useCallback(() => {
    const checkpoint = enhanceRollbackRef.current;
    if (checkpoint) {
      window.__TYPR_EDITORS__?.[checkpoint.sessionId]?.setSuppressChangeHandling(false);
      enhanceRollbackRef.current = null;
    }
  }, []);

  const cancelLocalLlmGeneration = useCallback(() => {
    void connectorCommands.getLlmConnection()
      .then(({ type, connection }) => {
        if (type !== "TyprLocal" || !connection.api_base) {
          return;
        }

        const cancelUrl = new URL(connection.api_base);
        cancelUrl.pathname = "/cancel";
        cancelUrl.search = "";
        return fetch(cancelUrl.toString(), { method: "GET" });
      })
      .catch((error) => {
        console.warn("[ENHANCE_CANCEL_LOCAL_FAILED]", error);
      });
  }, []);

  const enhance = useMutation({
    mutationKey: ["enhance", sessionId],
    mutationFn: async ({
      triggerType,
      templateId,
    }: {
      triggerType: "manual" | "template" | "auto";
      templateId?: string | null;
    } = { triggerType: "manual" }) => {
      // Prevent concurrent requests using synchronous ref guard
      if (enhanceControllerRef.current && !enhanceControllerRef.current.signal.aborted) {
        enhanceControllerRef.current.abort();
        await restoreEnhanceCheckpoint("superseded");
      }

      // Create new controller for this request
      const controller = new AbortController();
      enhanceControllerRef.current = controller;
      setEnhanceController(controller);

      // Only invalidate if we're not already connected to avoid excessive polling
      if (!enhanceController) {
        await queryClient.invalidateQueries({ queryKey: ["llm-connection"] });
      }

      const [cloudModel, general, session, templateType] = await Promise.all([
        connectorCommands.getCloudModel(),
        configCommands.getGeneralConfig(),
        dbCommands.getSession({ id: sessionId }),
        getTemplateTypeForTask("meetingSummary"),
      ]);

      // Reconstruct config object for template compatibility
      const config = { general };

      // Use words from session to pick up user edits from transcript view
      // Fall back to separate words table for onboarding sessions if needed
      let words;
      if (sessionId === onboardingSessionId) {
        words = await dbCommands.getWordsOnboarding();
      } else {
        words = session?.words || [];
      }

      const freshIsLocalLlm = templateType === "TyprLocal";
      setActualIsLocalLlm(freshIsLocalLlm);

      if (freshIsLocalLlm) {
        setProgress(0);
      }

      const wordsThreshold = AI_GENERATION_MIN_WORDS;
      if (!words.length || words.length < wordsThreshold) {
        toast({
          id: "short-timeline",
          title: <Trans>Recording too short</Trans>,
          content: <Trans>Typr needs at least {wordsThreshold} words to enhance your note</Trans>,
          dismissible: true,
          duration: 5000,
        });
        return;
      }

      const effectiveTemplateId = templateId !== undefined
        ? templateId
        : config.general?.selected_template_id;

      const startedAtMs = Date.now();
      enhanceContextRef.current = {
        triggerType,
        startedAtMs,
        llmConnectionType: templateType,
        cloudModel: cloudModel || null,
        templateId: effectiveTemplateId ?? null,
      };
      console.info("[ENHANCE_START]", {
        session_id: sessionId,
        trigger_type: triggerType,
        llm_connection_type: templateType,
        cloud_model: cloudModel || null,
        template_id: effectiveTemplateId ?? null,
        words_count: words.length,
      });

      const selectedTemplate = await TemplateService.getTemplate(effectiveTemplateId ?? "");

      const shouldUseH1Headers = !effectiveTemplateId && h1Headers.length > 0;

      // Templates = rigid structure, Auto = flexible AI-driven structure
      const grammarSections = selectedTemplate?.sections.map(s => s.title) || null;
      console.info("[TemplateTrace] enhance:resolved", {
        session_id: sessionId,
        trigger_type: triggerType,
        source_type: session?.source_type ?? null,
        requested_template_id: templateId ?? null,
        config_template_id: config.general?.selected_template_id ?? null,
        effective_template_id: effectiveTemplateId ?? null,
        resolved_template_id: selectedTemplate?.id ?? null,
        resolved_template_title: selectedTemplate?.title ?? null,
        section_count: selectedTemplate?.sections.length ?? 0,
        section_titles: selectedTemplate?.sections.map(section => section.title) ?? [],
        use_h1_headers: shouldUseH1Headers,
      });

      const participants = await dbCommands.sessionListParticipants(sessionId);

      // KISS: Clean template selection using available session data
      const templateKeys = getTemplateKeys(session);
      console.info("[TemplateTrace] enhance:render", {
        session_id: sessionId,
        system_template: templateKeys.system,
        user_template: templateKeys.user,
        passes_template_info: !shouldUseH1Headers && !!selectedTemplate,
        passes_user_headers: shouldUseH1Headers,
      });

      // Safe rendering with fallback to default templates
      let systemMessage: string;
      let userMessage: string;

      try {
        systemMessage = await templateCommands.render(
          templateKeys.system,
          {
            config,
            type: templateType,
            // Pass userHeaders when using H1 headers, templateInfo otherwise
            ...(shouldUseH1Headers
              ? { userHeaders: h1Headers }
              : { templateInfo: selectedTemplate }),
          },
        );

        userMessage = await templateCommands.render(
          templateKeys.user,
          {
            type: templateType,
            editor: finalInput,
            words: JSON.stringify(words),
            participants,
            templateInfo: selectedTemplate,
          },
        );
      } catch (error) {
        console.warn("YouTube template failed, using default:", error);

        // Fallback to default templates
        systemMessage = await templateCommands.render(
          "enhance.system",
          {
            config,
            type: templateType,
            ...(shouldUseH1Headers
              ? { userHeaders: h1Headers }
              : { templateInfo: selectedTemplate }),
          },
        );

        userMessage = await templateCommands.render(
          "enhance.user",
          {
            type: templateType,
            editor: finalInput,
            words: JSON.stringify(words),
            participants,
            templateInfo: selectedTemplate,
          },
        );
      }

      const abortSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(120 * 1000)]);

      const provider = await modelProvider(undefined, {
        includeOnboardingModel: sessionId === onboardingSessionId,
        task: "meetingSummary",
      });
      const model = sessionId === onboardingSessionId
        ? provider.languageModel("onboardingModel")
        : provider.languageModel("defaultModel");

      const activeEditorHandle = window.__TYPR_EDITORS__?.[sessionId];
      const activeEditor = activeEditorHandle?.editor ?? null;
      const previousEnhancedMemoHtml = session?.enhanced_memo_html ?? null;
      const previousEditorHtml = previousEnhancedMemoHtml
        ? activeEditor?.getHTML() ?? previousEnhancedMemoHtml
        : null;
      enhanceRollbackRef.current = {
        sessionId,
        enhancedMemoHtml: previousEnhancedMemoHtml,
        editorHtml: previousEditorHtml,
        showRaw: !previousEnhancedMemoHtml,
      };
      activeEditorHandle?.setSuppressChangeHandling(true);

      // Only fire normal_enhance_start for non-template enhancements
      // Template enhancements already fired their specific event in the floating button
      if (sessionId !== onboardingSessionId && triggerType !== "template") {
        safeAnalyticsEvent({
          event: "normal_enhance_start",
          distinct_id: userId,
          session_id: sessionId,
          connection_type: templateType,
        });
      }

      const { fullStream } = streamText({
        abortSignal,
        model,
        maxTokens: CLOUD_GENERATION_TOKEN_BUDGETS.meetingNotes,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        experimental_transform: [
          markdownTransform(),
          smoothStream({ delayInMs: 120, chunking: "line" }),
        ],
        ...(freshIsLocalLlm && {
          providerOptions: {
            [localProviderName]: {
              metadata: {
                grammar: {
                  task: "enhance",
                  sections: grammarSections,
                } satisfies Grammar,
              },
            },
          },
        }),
      });

      // Clear only the visible editor draft. The committed session summary is replaced
      // once the stream succeeds, so cancel/error can restore the previous notes.
      setStreamingPhase("starting");
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "start", {
        sessionId,
        triggerType,
        templateId: effectiveTemplateId ?? null,
        chunkFlushMs: STREAM_FLUSH_INTERVAL_MS,
      });
      if (activeEditor) {
        const scrollContainer = getEditorScrollContainer(sessionId);
        const shouldFollowBottom = scrollContainer ? isNearBottom(scrollContainer) : true;
        const previousScrollTop = scrollContainer?.scrollTop ?? 0;

        activeEditor.commands.setContent("", false);
        restoreStreamingScroll(scrollContainer, shouldFollowBottom, previousScrollTop);
        debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "clear_editor", {
          sessionId,
          shouldFollowBottom,
          scroll: getScrollDebugSnapshot(scrollContainer),
        });
      }
      // console.log("🎬 [Streaming] Starting AI enhancement");

      let acc = "";
      let pendingMarkdown = "";
      let chunkCount = 0;
      let updateCount = 0;
      let lastFlushAt = 0;

      const flushPendingMarkdown = async () => {
        if (controller.signal.aborted) {
          pendingMarkdown = "";
          return;
        }

        if (!pendingMarkdown) {
          return;
        }

        const markdownToFlush = pendingMarkdown;
        pendingMarkdown = "";
        lastFlushAt = Date.now();
        updateCount++;
        if (updateCount === 1) {
          setStreamingPhase("streaming");
        }

        const html = await miscCommands.opinionatedMdToHtml(markdownToFlush);

        const editorHandle = window.__TYPR_EDITORS__?.[sessionId];
        editorHandle?.setSuppressChangeHandling(true);
        const editorInstance = editorHandle?.editor;
        if (editorInstance) {
          const scrollContainer = getEditorScrollContainer(sessionId);
          const shouldFollowBottom = scrollContainer ? isNearBottom(scrollContainer) : true;
          const previousScrollTop = scrollContainer?.scrollTop ?? 0;
          const endPos = editorInstance.state.doc.content.size;

          editorInstance.commands.insertContentAt(endPos, html);
          restoreStreamingScroll(scrollContainer, shouldFollowBottom, previousScrollTop);
          if (updateCount === 1 || updateCount % 10 === 0) {
            debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "flush", {
              sessionId,
              updateCount,
              chunkCount,
              markdownChars: markdownToFlush.length,
              totalChars: acc.length,
              shouldFollowBottom,
              scroll: getScrollDebugSnapshot(scrollContainer),
            });
          }
        } else {
          debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "flush_fallback", {
            sessionId,
            updateCount,
            chunkCount,
            totalChars: acc.length,
          });
        }
      };

      for await (const chunk of fullStream) {
        if (controller.signal.aborted) {
          throw new DOMException("Enhance cancelled", "AbortError");
        }

        if (chunk.type === "text-delta") {
          acc += chunk.textDelta;
          pendingMarkdown += chunk.textDelta;
          chunkCount++;
        }
        if (chunk.type === "tool-call" && freshIsLocalLlm) {
          const chunkProgress = chunk.args?.progress ?? 0;
          setProgress(chunkProgress);
        }

        if (pendingMarkdown && Date.now() - lastFlushAt >= STREAM_FLUSH_INTERVAL_MS) {
          await flushPendingMarkdown();
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException("Enhance cancelled", "AbortError");
      }

      const streamEndedAtMs = Date.now();
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "stream_end", {
        sessionId,
        chunkCount,
        updateCount,
        totalChars: acc.length,
        elapsedMs: streamEndedAtMs - startedAtMs,
      });

      await flushPendingMarkdown();
      const visibleContentDoneAtMs = Date.now();
      setStreamingPhase("idle");
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "writing_bar_hidden", {
        sessionId,
        chunkCount,
        updateCount,
        totalChars: acc.length,
        finalFlushMs: visibleContentDoneAtMs - streamEndedAtMs,
        elapsedMs: visibleContentDoneAtMs - startedAtMs,
      });

      // Final sync to ensure complete content
      updateCount++;

      // Strip any XML tags that LLM might have included despite instructions
      let cleanedMarkdown = stripDisallowedXmlTags(acc);

      if (!cleanedMarkdown) {
        console.error("[ENHANCE_EMPTY_RESULT]", {
          session_id: sessionId,
          trigger_type: enhanceContextRef.current?.triggerType ?? triggerType,
          llm_connection_type: templateType,
          cloud_model: cloudModel || null,
          chunk_count: chunkCount,
          update_count: updateCount,
          elapsed_ms: Date.now() - startedAtMs,
        });
        throw new Error("enhance_empty_result");
      }

      const validationIssues = getSummaryValidationIssues(cleanedMarkdown);
      if (validationIssues.length > 0) {
        console.warn("[ENHANCE_INVALID_FORMAT]", {
          session_id: sessionId,
          trigger_type: enhanceContextRef.current?.triggerType ?? triggerType,
          llm_connection_type: templateType,
          cloud_model: cloudModel || null,
          issues: validationIssues,
        });

        try {
          const repairAbortSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
          cleanedMarkdown = await repairSummaryMarkdown({
            model,
            markdown: cleanedMarkdown,
            summaryLanguage: general.summary_language ?? "English",
            abortSignal: repairAbortSignal,
          });

          const postRepairIssues = getSummaryValidationIssues(cleanedMarkdown);
          if (postRepairIssues.length > 0) {
            console.error("[ENHANCE_INVALID_AFTER_REPAIR]", {
              session_id: sessionId,
              trigger_type: enhanceContextRef.current?.triggerType ?? triggerType,
              llm_connection_type: templateType,
              cloud_model: cloudModel || null,
              issues: postRepairIssues,
            });
            throw new Error("enhance_invalid_output_after_repair");
          }

          console.info("[ENHANCE_REPAIR_DONE]", {
            session_id: sessionId,
            trigger_type: enhanceContextRef.current?.triggerType ?? triggerType,
            llm_connection_type: templateType,
            cloud_model: cloudModel || null,
            repaired: true,
          });
        } catch (repairError) {
          console.error("[ENHANCE_REPAIR_FAILED]", {
            session_id: sessionId,
            trigger_type: enhanceContextRef.current?.triggerType ?? triggerType,
            llm_connection_type: templateType,
            cloud_model: cloudModel || null,
            error: repairError,
          });
          throw repairError;
        }
      }

      const finalHtml = await miscCommands.opinionatedMdToHtml(cleanedMarkdown);
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "done", {
        sessionId,
        chunkCount,
        updateCount,
        totalChars: acc.length,
        elapsedAfterVisibleMs: Date.now() - visibleContentDoneAtMs,
        scroll: getScrollDebugSnapshot(getEditorScrollContainer(sessionId)),
      });

      setEnhancedContent(finalHtml);
      debugLogFor("DEBUG_AI_STREAM", "AiStreamDebug", "final_content_set", {
        sessionId,
        finalHtmlChars: finalHtml.length,
        elapsedAfterVisibleMs: Date.now() - visibleContentDoneAtMs,
      });
      return finalHtml;
    },
    onSuccess: (enhancedContent: string | undefined) => {
      // console.log("✅ [enhance] Enhancement completed");
      const context = enhanceContextRef.current;
      console.info("[ENHANCE_DONE]", {
        session_id: sessionId,
        trigger_type: context?.triggerType ?? "unknown",
        llm_connection_type: context?.llmConnectionType ?? "unknown",
        cloud_model: context?.cloudModel ?? null,
        template_id: context?.templateId ?? null,
        content_length: enhancedContent?.length ?? 0,
        elapsed_ms: context ? Date.now() - context.startedAtMs : null,
      });

      if (enhancedContent) {
        persistSession(undefined, true);

        // Snapshot the auto-generated summary for instant revert when switching back to "Auto"
        if (context?.triggerType !== "template") {
          onAutoEnhanceSnapshot(enhancedContent);
        }

        onSuccess(enhancedContent);

        safeAnalyticsEvent({
          event: sessionId === onboardingSessionId
            ? "onboarding_enhance_done"
            : "normal_enhance_done",
          distinct_id: userId,
          session_id: sessionId,
          connection_type: context?.llmConnectionType ?? "unknown",
        });
      }

      if (actualIsLocalLlm) {
        setProgress(0);
      }
      setStreamingPhase("idle");
      releaseEnhanceCheckpoint();

      // Clean up controller
      setEnhanceController(null);
      enhanceControllerRef.current = null;
      enhanceContextRef.current = null;
    },
    onError: async (error) => {
      const context = enhanceContextRef.current;
      const err = error as {
        message?: string;
        stack?: string;
        name?: string;
        cause?: unknown;
      };
      const errorMessage = typeof error === "string"
        ? error
        : (err?.message ?? JSON.stringify(error));
      console.error("[ENHANCE_FAILED]", {
        session_id: sessionId,
        trigger_type: context?.triggerType ?? "unknown",
        llm_connection_type: context?.llmConnectionType ?? "unknown",
        cloud_model: context?.cloudModel ?? null,
        template_id: context?.templateId ?? null,
        elapsed_ms: context ? Date.now() - context.startedAtMs : null,
        error_name: err?.name ?? "unknown",
        error_message: errorMessage,
        error_stack: err?.stack ?? null,
        error_cause: err?.cause ?? null,
      });

      if (actualIsLocalLlm) {
        setProgress(0);
      }
      setStreamingPhase("idle");

      const lowered = errorMessage.toLowerCase();
      const isCancel = lowered.includes("cancel")
        || lowered.includes("aborted")
        || lowered.includes("aborterror");

      if (!isCancel) {
        // Only show error toast for real errors, not cancellations
        enhanceFailedToast();
      }

      await restoreEnhanceCheckpoint(isCancel ? "cancel" : "error");

      // Clean up controller
      setEnhanceController(null);
      enhanceControllerRef.current = null;
      enhanceContextRef.current = null;
    },
  });

  const cancel = useCallback(() => {
    if (enhanceControllerRef.current && !enhanceControllerRef.current.signal.aborted) {
      enhanceControllerRef.current.abort();
      cancelLocalLlmGeneration();
    }
  }, [cancelLocalLlmGeneration]);

  const isEnhancing = !!enhanceController;

  // Debug: Log isEnhancing state
  useEffect(() => {
    debugLogFor("DEBUG_ENHANCE", "EnhanceDebug", "enhance state changed", {
      isEnhancing,
      status: enhance.status,
    });
  }, [isEnhancing, enhanceController, enhance.status]);

  return {
    enhance,
    cancel,
    isEnhancing,
    streamingPhase,
    progress: actualIsLocalLlm ? progress : undefined,
  };
}

function useAutoEnhance({
  sessionId,
  enhanceStatus,
  enhanceMutate,
}: {
  sessionId: string;
  enhanceStatus: string;
  enhanceMutate: (params: { triggerType: "auto"; templateId?: string | null }) => void;
}) {
  const ongoingSessionStatus = useOngoingSession((s) => s.status);
  const autoEnhanceTemplate = useOngoingSession((s) => s.autoEnhanceTemplate);
  const setAutoEnhanceTemplate = useOngoingSession((s) => s.setAutoEnhanceTemplate);
  const prevOngoingSessionStatus = usePreviousValue(ongoingSessionStatus);
  const setShowRaw = useSession(sessionId, (s) => s.setShowRaw);
  const needsEnhance = useSession(sessionId, (s) => s.session.needs_enhance);
  const refreshSession = useSession(sessionId, (s) => s.refresh);
  const claimedRef = useRef(false);

  // Regular recording auto-enhancement (existing logic)
  useEffect(() => {
    if (
      (prevOngoingSessionStatus === "running_active" || prevOngoingSessionStatus === "running_paused")
      && ongoingSessionStatus === "inactive"
      && enhanceStatus !== "pending"
    ) {
      setShowRaw(false);

      // Use the selected template and then clear it
      console.info("[TemplateTrace] auto-enhance:recording-stop", {
        session_id: sessionId,
        auto_enhance_template_id: autoEnhanceTemplate ?? null,
      });
      enhanceMutate({
        triggerType: "auto",
        templateId: autoEnhanceTemplate,
      });

      // Clear the template after using it (one-time use)
      setAutoEnhanceTemplate(null);
    }
  }, [
    ongoingSessionStatus,
    enhanceStatus,
    sessionId,
    enhanceMutate,
    setShowRaw,
    autoEnhanceTemplate,
    setAutoEnhanceTemplate,
    prevOngoingSessionStatus,
  ]);

  // Claim needs_enhance sessions for foreground enhancement (YouTube, audio upload, etc.)
  // This gives the same streaming UI as regular transcription sessions.
  useEffect(() => {
    if (!needsEnhance || enhanceStatus === "pending" || claimedRef.current) {
      return;
    }

    claimedRef.current = true;

    const claimAndEnhance = async () => {
      const session = await dbCommands.getSession({ id: sessionId });
      if (!session || !session.needs_enhance) {
        if (session) {
          await refreshSession();
        }
        claimedRef.current = false;
        return;
      }

      await dbCommands.upsertSession({ ...session, needs_enhance: false });
      await refreshSession();
      setShowRaw(false);
      console.info("[TemplateTrace] auto-enhance:needs-enhance-claim", {
        session_id: sessionId,
        selected_template_id_from_config: "used-by-mutation-default",
      });
      enhanceMutate({ triggerType: "auto" });
    };

    claimAndEnhance().catch((error) => {
      claimedRef.current = false;
      console.error("[AutoEnhance] Failed to claim session", { sessionId, error });
    });
  }, [needsEnhance, enhanceStatus, sessionId, setShowRaw, enhanceMutate, refreshSession]);

  // Reset claimed ref when navigating to a different session
  useEffect(() => {
    claimedRef.current = false;
  }, [sessionId]);
}
