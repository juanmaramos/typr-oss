import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { Icon } from "@/components/ui/icon";
import { useTagsFeature } from "@/hooks/use-tags-feature";
import { commands as dbCommands, type Tag } from "@typr/plugin-db";
import MultipleSelector, { type Option } from "@typr/ui/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { noteHeaderChipClassName } from "../styles";

interface TagChipProps {
  sessionId: string;
  hashtags?: string[];
}

const normalizeTagName = (name: string): string => name.trim().replace(/\s+/g, " ");

const toOption = (tag: Tag): Option => ({ value: tag.id, label: tag.name });

export function TagChip({ sessionId }: TagChipProps) {
  const { t } = useLingui();
  const isTagsEnabled = useTagsFeature();

  const { data: sessionTags = [] } = useQuery({
    queryKey: ["session-tags", sessionId],
    queryFn: () => dbCommands.listSessionTags(sessionId),
    enabled: isTagsEnabled,
  });

  if (!isTagsEnabled) {
    return null;
  }

  const firstTag = sessionTags[0]?.name;
  const additionalTags = Math.max(0, sessionTags.length - 1);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={noteHeaderChipClassName}
        >
          <Icon name="ri-hashtag" className="h-[14px] w-[14px] text-muted-foreground" />
          {firstTag
            ? <span className="max-w-[120px] truncate">{firstTag}</span>
            : <span className="text-muted-foreground">{t`Add tags`}</span>}
          {additionalTags > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-medium text-foreground/80">
              +{additionalTags}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 bg-background p-2"
        align="start"
      >
        <TagChipEditor sessionId={sessionId} />
      </PopoverContent>
    </Popover>
  );
}

function TagChipEditor({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const { data: sessionTags = [] } = useQuery({
    queryKey: ["session-tags", sessionId],
    queryFn: () => dbCommands.listSessionTags(sessionId),
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["all-tags"],
    queryFn: () => dbCommands.listAllTags(),
  });

  const selectedOptions = useMemo<Option[]>(
    () => sessionTags.map(toOption),
    [sessionTags],
  );

  const defaultOptions = useMemo<Option[]>(
    () => allTags.map(toOption),
    [allTags],
  );

  const invalidateTagQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["session-tags", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["all-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions", "tag-filter"] }),
    ]);
  };

  const syncTagsMutation = useMutation({
    mutationFn: async (nextOptions: Option[]) => {
      const nextNames = Array.from(
        new Set(
          nextOptions
            .map(option => normalizeTagName(option.label))
            .filter(name => name.length > 0 && name.length <= 50),
        ),
      );

      const nextNameSet = new Set(nextNames.map(name => name.toLowerCase()));
      const currentByName = new Map(sessionTags.map(tag => [tag.name.toLowerCase(), tag]));
      const globalByName = new Map(allTags.map(tag => [tag.name.toLowerCase(), tag]));

      for (const currentTag of sessionTags) {
        if (!nextNameSet.has(currentTag.name.toLowerCase())) {
          await dbCommands.unassignTagFromSession(currentTag.id, sessionId);
        }
      }

      for (const name of nextNames) {
        const normalizedName = name.toLowerCase();
        if (currentByName.has(normalizedName)) {
          continue;
        }

        const existingGlobalTag = globalByName.get(normalizedName);
        const tag = existingGlobalTag ?? await dbCommands.upsertTag({
          id: crypto.randomUUID(),
          name,
        });

        await dbCommands.assignTagToSession(tag.id, sessionId);
      }
    },
    onSuccess: async () => {
      await invalidateTagQueries();
    },
  });

  return (
    <MultipleSelector
      value={selectedOptions}
      options={defaultOptions}
      creatable
      hidePlaceholderWhenSelected
      placeholder={t`Search or add tags...`}
      emptyIndicator={<p className="px-2 py-1 text-center text-xs text-muted-foreground">{t`No tags found.`}</p>}
      createLabel={(value) => t`Create "${value}"`}
      className="w-full min-h-9 rounded-md border border bg-background text-xs text-foreground/80 focus-within:border focus-within:ring-0 focus-within:shadow-none"
      badgeClassName="h-6 rounded-md border-0 bg-muted px-2 pr-6 text-[11px] leading-none font-medium text-foreground/80 [&>button]:size-6 [&>button_svg]:size-3"
      commandProps={{
        className: "rounded-md border-0 bg-transparent",
        label: t`Select tags`,
      }}
      inputProps={{
        className: "py-1.5 pr-3 text-xs leading-4 placeholder:text-muted-foreground",
        "aria-label": t`Search or add tags`,
      }}
      hideClearAllButton
      disabled={syncTagsMutation.isPending}
      onChange={(nextOptions) => {
        syncTagsMutation.mutate(nextOptions);
      }}
    />
  );
}
