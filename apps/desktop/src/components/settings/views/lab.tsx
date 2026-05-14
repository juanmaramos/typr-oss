import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HashIcon, PenLineIcon } from "lucide-react";

import { commands as flagsCommands } from "@typr/plugin-flags";
import { Badge } from "@typr/ui/components/ui/badge";
import { Switch } from "@typr/ui/components/ui/switch";

import { FEATURES } from "@/lib/features";

export default function Lab() {
  return (
    <div>
      {/* Lab Header */}
      <div className="mb-6 pb-4 border-b">
        <h3 className="text-base font-medium text-foreground mb-1">
          <Trans>Experimental features</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Try new capabilities currently in development. These features may have occasional issues and are refined
            based on your feedback.
          </Trans>
        </p>
      </div>

      <div className="space-y-4">
        {FEATURES.ENABLE_AGENT_WRITING_ASSISTANT && <AgentWritingToggle />}
        <TagsSystemToggle />
        <TranscriptionStatusNotchToggle />
      </div>
    </div>
  );
}

function AgentWritingToggle() {
  const { t } = useLingui();
  const { enabled, toggle } = useFeatureFlag("AgentWritingChat");

  return (
    <FeatureFlag
      title={t`AI writing assistant`}
      description={t`Write and refine your notes by chatting with AI. Select Edit mode in the chat sidebar to start editing.`}
      icon={<PenLineIcon />}
      badge={t`Beta`}
      enabled={enabled}
      onToggle={toggle}
    />
  );
}

function TagsSystemToggle() {
  const { t } = useLingui();
  const { enabled, toggle } = useFeatureFlag("TagsSystem");

  return (
    <FeatureFlag
      title={t`Tags system`}
      description={t`Assign formal tags to notes and filter related notes from the sidebar.`}
      icon={<HashIcon />}
      badge={t`Beta`}
      enabled={enabled}
      onToggle={toggle}
    />
  );
}

function TranscriptionStatusNotchToggle() {
  const { t } = useLingui();
  const { enabled, toggle } = useFeatureFlag("TranscriptionStatusNotch");

  return (
    <FeatureFlag
      title={t`Transcription status notch`}
      description={t`Show a small recording status control while transcription is active, with stop access.`}
      icon={<i className="ri-stop-circle-fill text-[22px]" />}
      badge={t`Beta`}
      enabled={enabled}
      onToggle={toggle}
    />
  );
}

type LabFeatureFlag = "AgentWritingChat" | "TagsSystem" | "TranscriptionStatusNotch";

function useFeatureFlag(flag: LabFeatureFlag) {
  const queryClient = useQueryClient();

  const flagQuery = useQuery({
    queryKey: ["flags", flag],
    queryFn: () => flagsCommands.isEnabled(flag),
  });

  const flagMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        await flagsCommands.enable(flag);
        return;
      }
      await flagsCommands.disable(flag);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flag", flag] });
      queryClient.invalidateQueries({ queryKey: ["flags", flag] });
    },
  });

  return {
    enabled: flagQuery.data ?? false,
    toggle: (enabled: boolean) => flagMutation.mutate(enabled),
  };
}

function FeatureFlag({
  title,
  description,
  icon,
  badge,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-6 items-center justify-center">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">
                {title}
              </div>
              {badge && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                  {badge}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            color="gray"
          />
        </div>
      </div>
    </div>
  );
}
