import { AskComposer } from "@/components/ask/ask-composer";
import { useTypr } from "@/contexts";
import { useAllModels } from "@/hooks/useModels";
import { askQueryKeys, createAskThreadWithUserMessage } from "@/lib/ask";
import { getProjectActionErrorMessage, type Project } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { toast } from "@typr/ui/components/ui/toast";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface ProjectAskLauncherProps {
  project: Project;
  sourceCount: number;
}

export function ProjectAskLauncher({ project, sourceCount }: ProjectAskLauncherProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const { selectedModel, isAutoMode } = useAllModels();
  const [prompt, setPrompt] = useState("");

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error(t`Missing user`);
      }

      const thread = await createAskThreadWithUserMessage({
        userId,
        scope: { type: "Project", id: project.id },
        prompt,
        modelId: isAutoMode ? "auto" : selectedModel?.id ?? "auto",
      });

      return thread;
    },
    onSuccess: async (thread) => {
      trackEvent("ask_thread_created", userId, {
        project_id: project.id,
        source: "project_launcher",
        has_initial_prompt: true,
      });
      setPrompt("");
      await queryClient.invalidateQueries({ queryKey: [askQueryKeys.threads] });
      navigate({ to: "/app/ask/$threadId", params: { threadId: thread.id } });
    },
    onError: (error) => {
      toast({
        id: "ask-create-thread-error",
        title: <Trans>Couldn’t start Ask</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const disabled = sourceCount === 0 || createThreadMutation.isPending;

  return (
    <section className="shrink-0 pb-8 pt-2" aria-label={t`Ask this project`}>
      <AskComposer
        value={prompt}
        onValueChange={setPrompt}
        onSubmit={() => {
          if (!prompt.trim() || disabled) {
            return;
          }
          createThreadMutation.mutate();
        }}
        placeholder={sourceCount > 0
          ? t`Ask this project...`
          : t`Add notes or indexed files before asking this project`}
        disabled={disabled}
        isSubmitting={createThreadMutation.isPending}
        layout="project"
        className="bg-background/95"
      />
    </section>
  );
}
