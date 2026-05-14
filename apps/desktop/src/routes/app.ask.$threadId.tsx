import { AskComposer } from "@/components/ask/ask-composer";
import { AskPageShell } from "@/components/ask/ask-page-shell";
import { noteHeaderChipClassName } from "@/components/editor-area/note-header/styles";
import { ProjectIcon } from "@/components/projects/project-icon";
import {
  hasProjectSourceCitations,
  type ProjectCitationSource,
  ProjectSourceCitationMarkdown,
} from "@/components/projects/project-source-citation-markdown";
import { Loader } from "@/components/ui/loader";
import { MessageAction, MessageActions } from "@/components/ui/message-action";
import { ScrollButton } from "@/components/ui/scroll-button";
import { useTypr } from "@/contexts";
import { useAllModels } from "@/hooks/useModels";
import {
  appendAskUserMessage,
  askQueryKeys,
  type AskSnapshotSource,
  generateAssistantAnswerForThread,
  getAskThread,
  isAskGenerationStale,
  listAskContextSnapshots,
  listAskMessages,
  markAskMessageFailed,
  parseAskSnapshotSources,
} from "@/lib/ask";
import { listProjectFiles, projectFileQueryKeys } from "@/lib/project-files";
import { getProject, type Project, projectQueryKeys } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { logAskLayoutDebug } from "@/utils/ask-layout-debug";
import { Button } from "@typr/ui/components/ui/button";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { writeText as writeTextToClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ASK_BOTTOM_FOLLOW_THRESHOLD_PX = 32;

export const Route = createFileRoute("/app/ask/$threadId")({
  component: Component,
});

function Component() {
  const { t } = useLingui();
  const { threadId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const { selectedModel, isAutoMode } = useAllModels();
  const [prompt, setPrompt] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [streamingAssistant, setStreamingAssistant] = useState<
    Awaited<ReturnType<typeof listAskMessages>>[number] | null
  >(
    null,
  );
  const [streamingContent, setStreamingContent] = useState("");
  const generatedForUserMessageIdsRef = useRef(new Set<string>());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const lastFollowDebugRef = useRef<string | null>(null);
  const lastScrollDebugRef = useRef<string | null>(null);

  const threadQuery = useQuery({
    queryKey: [askQueryKeys.thread, threadId],
    queryFn: () => getAskThread(threadId),
  });

  const messagesQuery = useQuery({
    queryKey: [askQueryKeys.messages, threadId],
    queryFn: () => listAskMessages(threadId),
  });

  const snapshotsQuery = useQuery({
    queryKey: [askQueryKeys.snapshots, threadId],
    queryFn: () => listAskContextSnapshots(threadId),
  });

  const projectQuery = useQuery({
    queryKey: [projectQueryKeys.detail, threadQuery.data?.scope_id],
    queryFn: () => getProject(threadQuery.data!.scope_id!),
    enabled: threadQuery.data?.scope_type === "Project" && Boolean(threadQuery.data.scope_id),
  });

  const projectFilesQuery = useQuery({
    queryKey: [projectFileQueryKeys.list, threadQuery.data?.scope_id],
    queryFn: () => listProjectFiles(threadQuery.data!.scope_id!),
    enabled: threadQuery.data?.scope_type === "Project" && Boolean(threadQuery.data.scope_id),
  });

  const appendMessageMutation = useMutation({
    mutationFn: () =>
      appendAskUserMessage({
        threadId,
        prompt,
        modelId: isAutoMode ? "auto" : selectedModel?.id ?? "auto",
      }),
    onSuccess: async (message) => {
      trackEvent("ask_message_sent", userId, {
        thread_id: threadId,
        ...(thread?.scope_id ? { project_id: thread.scope_id } : {}),
        prompt_length: message.content.length,
        model_id: message.model_id ?? "auto",
      });
      setPrompt("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.messages, threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.thread, threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "ask-append-message-error",
        title: <Trans>Couldn’t send message</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    },
  });

  const generateAnswerMutation = useMutation({
    mutationFn: (variables: { threadId: string; modelId: string }) =>
      generateAssistantAnswerForThread({
        ...variables,
        onAssistantMessage: (message) => {
          setStreamingAssistant(message);
          setStreamingContent("");
        },
        onContentDelta: (_messageId, content) => setStreamingContent(content),
      }),
    onSuccess: async (_message, variables) => {
      const snapshots = await listAskContextSnapshots(variables.threadId);
      const snapshot = snapshots.find(snapshot => snapshot.message_id === _message.id);
      trackEvent("ask_answer_generated", userId, {
        thread_id: variables.threadId,
        ...(thread?.scope_id ? { project_id: thread.scope_id } : {}),
        model_id: variables.modelId,
        source_count: snapshot?.source_count ?? 0,
        status: "success",
      });
      setStreamingAssistant(null);
      setStreamingContent("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.messages, variables.threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.snapshots, variables.threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.thread, variables.threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] }),
      ]);
    },
    onError: async (error, variables) => {
      trackEvent("ask_answer_generated", userId, {
        thread_id: variables.threadId,
        ...(thread?.scope_id ? { project_id: thread.scope_id } : {}),
        model_id: variables.modelId,
        source_count: 0,
        status: "failed",
      });
      setStreamingAssistant(null);
      setStreamingContent("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.messages, variables.threadId] }),
        queryClient.invalidateQueries({ queryKey: [askQueryKeys.snapshots, variables.threadId] }),
      ]);
      toast({
        id: "ask-generate-answer-error",
        title: <Trans>Couldn’t answer</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    },
  });

  const failStaleMessageMutation = useMutation({
    mutationFn: (message: Awaited<ReturnType<typeof listAskMessages>>[number]) =>
      markAskMessageFailed(message, t`This answer was interrupted before it finished.`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [askQueryKeys.messages, threadId] });
    },
  });

  const project = projectQuery.data;
  const thread = threadQuery.data;
  const messages = messagesQuery.data ?? [];
  const activeStreamingAssistant = streamingAssistant
    ? { ...streamingAssistant, content: streamingContent, status: "Streaming" as const }
    : null;
  const displayedMessages =
    activeStreamingAssistant && !messages.some(message => message.id === activeStreamingAssistant.id)
      ? [...messages, activeStreamingAssistant]
      : messages.map(message =>
        activeStreamingAssistant?.id === message.id
          ? activeStreamingAssistant
          : message
      );
  const snapshotsByMessageId = useMemo(
    () => new Map((snapshotsQuery.data ?? []).map(snapshot => [snapshot.message_id, snapshot])),
    [snapshotsQuery.data],
  );
  const fileStoragePathById = useMemo(
    () => new Map((projectFilesQuery.data ?? []).map(file => [file.id, file.storage_path])),
    [projectFilesQuery.data],
  );
  const latestMessage = messages[messages.length - 1];
  const staleGenerationMessages = messages.filter(isAskGenerationStale);
  const isAnswering = generateAnswerMutation.isPending
    || displayedMessages.some(message =>
      message.role === "Assistant" && ["Pending", "Streaming"].includes(message.status)
      && !isAskGenerationStale(message)
    );
  const handleOpenSource = useCallback(
    async (source: AskSnapshotSource) => {
      trackEvent("ask_source_opened", userId, {
        thread_id: threadId,
        ...(thread?.scope_id ? { project_id: thread.scope_id } : {}),
        source_type: source.sourceType === "file" ? "file" : "note",
      });

      if (source.sourceType === "file") {
        const storagePath = source.storagePath ?? (source.fileId ? fileStoragePathById.get(source.fileId) : null);
        if (storagePath) {
          await openPath(storagePath);
          return;
        }

        toast({
          id: "ask-open-file-source-error",
          title: <Trans>Couldn’t open file source</Trans>,
          content: <Trans>This file is no longer available in the project.</Trans>,
        });
        return;
      }

      if (source.sessionId) {
        navigate({
          to: "/app/note/$id",
          params: { id: source.sessionId },
        });
      }
    },
    [fileStoragePathById, navigate, thread?.scope_id, threadId, userId],
  );
  const handleCopyMessage = useCallback(async (message: Awaited<ReturnType<typeof listAskMessages>>[number]) => {
    if (!message.content.trim()) {
      return;
    }

    try {
      await writeTextToClipboard(message.content);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(current => current === message.id ? null : current), 2000);
    } catch (error) {
      toast({
        id: "ask-copy-message-error",
        title: <Trans>Couldn’t copy message</Trans>,
        content: error instanceof Error ? error.message : <Trans>Try again.</Trans>,
      });
    }
  }, []);
  const handleScroll = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > ASK_BOTTOM_FOLLOW_THRESHOLD_PX;
    const scrollDebugKey = [
      Math.round(distanceFromBottom / 32),
      Math.round(element.scrollHeight),
      Math.round(element.clientHeight),
      userScrolledUpRef.current,
    ].join(":");
    if (lastScrollDebugRef.current !== scrollDebugKey) {
      lastScrollDebugRef.current = scrollDebugKey;
      logAskLayoutDebug("scroll", {
        scrollTop: Math.round(element.scrollTop),
        scrollHeight: Math.round(element.scrollHeight),
        clientHeight: Math.round(element.clientHeight),
        distanceFromBottom: Math.round(distanceFromBottom),
        locked: userScrolledUpRef.current,
      });
    }
  }, []);

  useEffect(() => {
    if (!latestMessage || latestMessage.role !== "User" || isAnswering) {
      return;
    }

    if (generatedForUserMessageIdsRef.current.has(latestMessage.id)) {
      return;
    }

    generatedForUserMessageIdsRef.current.add(latestMessage.id);
    generateAnswerMutation.mutate({
      threadId,
      modelId: latestMessage.model_id ?? (isAutoMode ? "auto" : selectedModel?.id ?? "auto"),
    });
  }, [generateAnswerMutation, isAnswering, isAutoMode, latestMessage, selectedModel?.id, threadId]);

  useEffect(() => {
    if (userScrolledUpRef.current) {
      const element = scrollContainerRef.current;
      if (element) {
        const followDebugKey = [
          "skip",
          displayedMessages.length,
          Math.floor(streamingContent.length / 200),
          Math.round(element.scrollHeight),
          Math.round(element.clientHeight),
        ].join(":");
        if (lastFollowDebugRef.current !== followDebugKey) {
          lastFollowDebugRef.current = followDebugKey;
          logAskLayoutDebug("follow:skip", {
            scrollTop: Math.round(element.scrollTop),
            scrollHeight: Math.round(element.scrollHeight),
            clientHeight: Math.round(element.clientHeight),
            streamingLength: streamingContent.length,
          });
        }
      }
      return;
    }

    const element = scrollContainerRef.current;
    if (element) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: isAnswering ? "auto" : "smooth",
      });
      const followDebugKey = [
        "scroll",
        displayedMessages.length,
        Math.floor(streamingContent.length / 200),
        Math.round(element.scrollHeight),
        Math.round(element.clientHeight),
      ].join(":");
      if (lastFollowDebugRef.current !== followDebugKey) {
        lastFollowDebugRef.current = followDebugKey;
        logAskLayoutDebug("follow:scroll", {
          scrollTop: Math.round(element.scrollTop),
          scrollHeight: Math.round(element.scrollHeight),
          clientHeight: Math.round(element.clientHeight),
          streamingLength: streamingContent.length,
          messageCount: displayedMessages.length,
          isAnswering,
        });
      }
    }
  }, [displayedMessages.length, isAnswering, streamingContent]);

  useEffect(() => {
    userScrolledUpRef.current = false;
  }, [threadId]);

  if (threadQuery.isLoading) {
    return (
      <div className="flex h-full overflow-hidden bg-background">
        <AskPageShell>
          <Skeleton className="h-10 w-56 rounded-2xl" />
          <Skeleton className="mt-8 h-24 w-full rounded-3xl" />
        </AskPageShell>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            <Trans>Conversation not found</Trans>
          </div>
          <Button variant="secondary" className="mt-4" onClick={() => navigate({ to: "/app/ask" })}>
            <Trans>Back to Ask</Trans>
          </Button>
        </div>
      </div>
    );
  }

  if (thread.scope_type === "Project" && thread.scope_id && !projectQuery.isLoading && !project) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            <Trans>Project no longer available</Trans>
          </div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            <Trans>This conversation belonged to a project that has been deleted.</Trans>
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate({ to: "/app/ask" })}>
            <Trans>Back to Ask</Trans>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <AskPageShell
        scrollContainerRef={scrollContainerRef}
        onScroll={handleScroll}
        floatingControl={
          <ScrollButton
            containerRef={scrollContainerRef}
            threshold={ASK_BOTTOM_FOLLOW_THRESHOLD_PX}
            variant="outline"
            size="icon"
            aria-label={t`Go to latest message`}
            className="border-border/70 bg-background/95 text-muted-foreground shadow-float-pill backdrop-blur hover:text-foreground"
            onClick={() => {
              userScrolledUpRef.current = false;
            }}
          />
        }
        footer={
          <AskComposer
            value={prompt}
            onValueChange={setPrompt}
            onSubmit={() => {
              if (!prompt.trim() || appendMessageMutation.isPending || isAnswering) {
                return;
              }
              userScrolledUpRef.current = false;
              appendMessageMutation.mutate();
            }}
            placeholder={project ? t`Ask this project...` : t`Ask anything...`}
            disabled={isAnswering}
            isSubmitting={appendMessageMutation.isPending || generateAnswerMutation.isPending}
            layout="dock"
          />
        }
      >
        <div className="min-h-0 flex-1 py-8">
          <div className="space-y-8 select-text">
            {displayedMessages.map((message) => {
              const messageSources = parseAskSnapshotSources(snapshotsByMessageId.get(message.id));
              const hasInlineCitations = message.role === "Assistant"
                && hasAskInlineCitations(message.content, messageSources);

              return (
                <div
                  key={message.id}
                  className={message.role === "User"
                    ? "group flex flex-col items-end"
                    : "group flex justify-start"}
                >
                  {message.role === "User" && project && <AskProjectContextSnippet project={project} />}
                  <div
                    className={message.role === "User"
                      ? "max-w-2xl rounded-2xl bg-muted px-4 py-2 text-sm leading-6 text-foreground"
                      : "w-full text-sm leading-7 text-foreground"}
                  >
                    {message.role === "Assistant"
                      ? (
                        isAskGenerationStale(message)
                          ? (
                            <InterruptedAnswer
                              isRetrying={generateAnswerMutation.isPending || failStaleMessageMutation.isPending}
                              onRetry={() => {
                                failStaleMessageMutation.mutate(message, {
                                  onSuccess: () =>
                                    generateAnswerMutation.mutate({
                                      threadId,
                                      modelId: message.model_id ?? (isAutoMode ? "auto" : selectedModel?.id ?? "auto"),
                                    }),
                                });
                              }}
                            />
                          )
                          : message.status === "Pending" || message.status === "Streaming"
                          ? (
                            message.content.trim()
                              ? (
                                <AskAssistantMarkdown
                                  content={message.content}
                                  sources={messageSources}
                                  onOpenSource={handleOpenSource}
                                />
                              )
                              : <AnsweringIndicator />
                          )
                          : (
                            <AskAssistantMarkdown
                              content={message.content}
                              sources={messageSources}
                              onOpenSource={handleOpenSource}
                            />
                          )
                      )
                      : <div>{message.content}</div>}
                    {message.role === "Assistant" && !hasInlineCitations && (
                      <AskMessageSources
                        sources={messageSources}
                        onOpenSource={handleOpenSource}
                      />
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(message.created_at), "MMM d, h:mm a")}
                      {message.status === "Failed" ? <Trans>· Failed</Trans> : ""}
                      {isAskGenerationStale(message) ? <Trans>· Interrupted</Trans> : ""}
                    </div>
                    {message.content.trim() && (
                      <AskMessageActions
                        align={message.role === "User" ? "end" : "start"}
                        copied={copiedMessageId === message.id}
                        onCopy={() => handleCopyMessage(message)}
                      />
                    )}
                    {message.role === "Assistant" && message.status === "Failed" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 px-2 text-xs text-muted-foreground"
                        disabled={generateAnswerMutation.isPending}
                        onClick={() =>
                          generateAnswerMutation.mutate({
                            threadId,
                            modelId: message.model_id ?? (isAutoMode ? "auto" : selectedModel?.id ?? "auto"),
                          })}
                      >
                        <Trans>Retry</Trans>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {isAnswering && latestMessage?.role === "User" && !activeStreamingAssistant && <AnsweringIndicator />}

            {staleGenerationMessages.length > 0 && (
              <div className="max-w-2xl rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-warning-foreground">
                <Trans>One answer was interrupted. Retry it from the message above.</Trans>
              </div>
            )}
          </div>
        </div>
      </AskPageShell>
    </div>
  );
}

function AskMessageActions({
  align,
  copied,
  onCopy,
}: {
  align: "start" | "end";
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useLingui();

  return (
    <MessageActions
      className={cn(
        "mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
        align === "start" ? "justify-start" : "justify-end",
      )}
    >
      <MessageAction tooltip={copied ? t`Copied` : t`Copy message`}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onCopy}
          aria-label={copied ? t`Copied` : t`Copy message`}
        >
          {copied
            ? <i className="ri-check-line text-base text-success" />
            : <i className="ri-file-copy-line text-base" />}
        </Button>
      </MessageAction>
    </MessageActions>
  );
}

function AskProjectContextSnippet({ project }: { project: Project }) {
  return (
    <div className={cn(noteHeaderChipClassName, "mb-2 max-w-2xl bg-background hover:bg-background")}>
      <ProjectIcon icon={project.icon_value} color={project.icon_color} size="sm" className="ring-0" />
      <span className="min-w-0 truncate font-medium text-foreground">{project.name}</span>
      <span className="shrink-0 text-muted-foreground">
        <Trans>Whole project</Trans>
      </span>
    </div>
  );
}

function AskMessageSources({
  onOpenSource,
  sources,
}: {
  onOpenSource: (source: ReturnType<typeof parseAskSnapshotSources>[number]) => void;
  sources: ReturnType<typeof parseAskSnapshotSources>;
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Trans>Context</Trans>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map(source => (
          <Button
            key={`${source.key}-${source.sessionId ?? source.fileId ?? source.title}`}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-xs border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            onClick={() => onOpenSource(source)}
            title={source.title}
          >
            <span className="font-medium text-foreground">{source.key}</span>
            <span className="truncate">{source.title}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function AskAssistantMarkdown({
  content,
  onOpenSource,
  sources,
}: {
  content: string;
  onOpenSource: (source: AskSnapshotSource) => void;
  sources: AskSnapshotSource[];
}) {
  const sourceByCitationSource = useMemo(() => {
    const sourceMap = new Map<ProjectCitationSource, AskSnapshotSource>();
    const citationSources = sources.map((source) => {
      const citationSource: ProjectCitationSource = {
        key: source.key,
        sourceId: source.sessionId ?? source.fileId ?? source.key,
        title: source.title,
        type: source.sourceType === "file" ? "file" : "note",
      };

      sourceMap.set(citationSource, source);
      return citationSource;
    });

    return { citationSources, sourceMap };
  }, [sources]);

  return (
    <ProjectSourceCitationMarkdown
      className="prose prose-sm max-w-none text-sm leading-7 text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-strong:text-foreground"
      markdown={content}
      sources={sourceByCitationSource.citationSources}
      onOpenSource={(source) => {
        const askSource = sourceByCitationSource.sourceMap.get(source);
        if (askSource) {
          onOpenSource(askSource);
        }
      }}
    />
  );
}

function hasAskInlineCitations(content: string, sources: AskSnapshotSource[]) {
  const citationSources = sources.map((source): ProjectCitationSource => ({
    key: source.key,
    sourceId: source.sessionId ?? source.fileId ?? source.key,
    title: source.title,
    type: source.sourceType === "file" ? "file" : "note",
  }));

  return hasProjectSourceCitations(content, citationSources);
}

function AnsweringIndicator() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader variant="typing" size="md" />
      <span className="text-sm">
        <Trans>Answering from project notes</Trans>
      </span>
    </div>
  );
}

function InterruptedAnswer({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-warning-foreground">
      <div>
        <Trans>This answer was interrupted before it finished.</Trans>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 px-2 text-xs"
        disabled={isRetrying}
        onClick={onRetry}
      >
        <Trans>Retry</Trans>
      </Button>
    </div>
  );
}
