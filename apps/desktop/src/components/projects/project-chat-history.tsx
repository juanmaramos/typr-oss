import { archiveAskThread, askQueryKeys } from "@/lib/ask";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AskThread } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Skeleton } from "@typr/ui/components/ui/skeleton";
import { toast } from "@typr/ui/components/ui/toast";
import { formatDistanceToNow } from "@typr/utils/datetime";

interface ProjectChatHistoryProps {
  projectId: string;
  threads: AskThread[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function ProjectChatHistory({ projectId, threads, isLoading, isError, onRetry }: ProjectChatHistoryProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: archiveAskThread,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] }),
    onError: () =>
      toast({
        id: "project-chat-archive-error",
        title: <Trans>Couldn’t archive chat</Trans>,
        content: <Trans>Try again.</Trans>,
      }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-label={t`Loading project chats`}>
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-6">
        <p>
          <Trans>Couldn’t load project chats.</Trans>
        </p>
        <Button variant="secondary" onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-8 text-sm">
        <p className="font-medium">
          <Trans>No project chats yet</Trans>
        </p>
        <p className="text-muted-foreground">
          <Trans>Ask a question above to start a chat using this project’s notes and files.</Trans>
        </p>
      </div>
    );
  }

  return (
    <ul aria-label={t`Project chats`}>
      {threads.map(thread => {
        const title = thread.title || t`Untitled conversation`;
        return (
          <li key={thread.id} className="flex min-w-0 items-center gap-2 border-b border-border/60 last:border-0">
            <Link
              to="/app/projects/$projectId/chats/$threadId"
              params={{ projectId, threadId: thread.id }}
              className="flex min-w-0 flex-1 flex-col gap-1 rounded-control px-2 py-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-sm font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(thread.last_message_at ?? thread.updated_at), { addSuffix: true })}
              </span>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t`Archive ${title}`}
              title={t`Archive ${title}`}
              disabled={archive.isPending && archive.variables === thread.id}
              onClick={() => archive.mutate(thread.id)}
            >
              <i className="ri-archive-line" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
