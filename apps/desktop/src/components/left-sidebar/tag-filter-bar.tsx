import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { useTagsFeature } from "@/hooks/use-tags-feature";
import { commands as dbCommands, type Tag } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Checkbox } from "@typr/ui/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@typr/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";

interface TagFilterBarProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  visibleNotesCount?: number;
}

export function TagFilterBar({ selectedTags, onTagsChange, visibleNotesCount }: TagFilterBarProps) {
  const { t } = useLingui();
  const isTagsFeatureEnabled = useTagsFeature();
  const [open, setOpen] = useState(false);

  const { data: allTags = [], isFetched: hasLoadedAllTags, refetch: refetchAllTags } = useQuery({
    queryKey: ["all-tags"],
    queryFn: () => dbCommands.listAllTags(),
    enabled: isTagsFeatureEnabled,
  });

  const allTagsById = useMemo(() => new Map(allTags.map(tag => [tag.id, tag])), [allTags]);
  const selectedTagIds = useMemo(
    () => new Set(selectedTags.map(tag => tag.id)),
    [selectedTags],
  );

  useEffect(() => {
    if (!hasLoadedAllTags || selectedTags.length === 0) {
      return;
    }

    const synced = selectedTags.filter(tag => allTagsById.has(tag.id));
    if (synced.length !== selectedTags.length) {
      onTagsChange(synced);
    }
  }, [allTagsById, hasLoadedAllTags, onTagsChange, selectedTags]);

  const toggleTag = (tagId: string) => {
    const tag = allTagsById.get(tagId);
    if (!tag) {
      return;
    }

    const isSelected = selectedTagIds.has(tagId);

    if (isSelected) {
      onTagsChange(selectedTags.filter(selected => selected.id !== tagId));
      return;
    }

    onTagsChange([...selectedTags, tag]);
  };

  const clearFilters = () => {
    onTagsChange([]);
  };

  const countLabel = visibleNotesCount !== undefined
    ? `${visibleNotesCount}`
    : null;

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-baseline gap-1.5 select-none">
          <span className="text-[12px] font-semibold text-foreground/80">
            <Trans>Notes</Trans>
          </span>
          {countLabel !== null && (
            <span className="text-[11px] font-medium text-muted-foreground/70">
              {countLabel}
            </span>
          )}
        </div>

        {isTagsFeatureEnabled && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "h-7 w-7 rounded-md p-0 text-muted-foreground",
                  "transition-colors hover:bg-surface-400/60 hover:text-foreground",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/35",
                  selectedTags.length > 0 && "text-foreground",
                )}
              >
                <div className="relative">
                  <i className="ri-filter-3-line text-[15px]" />
                  {selectedTags.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] font-semibold text-background">
                      {selectedTags.length}
                    </span>
                  )}
                </div>
              </Button>
            </PopoverTrigger>

            <PopoverContent
              side="bottom"
              align="end"
              className="w-[270px] rounded-md border bg-background p-0 shadow-md"
            >
              <Command className="rounded-md border-0 bg-transparent">
                <CommandInput
                  placeholder={t`Search tags...`}
                  className="h-9 text-xs"
                  onFocus={() => {
                    void refetchAllTags();
                  }}
                />
                <CommandList className="max-h-56 pb-1">
                  <CommandEmpty>
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t`No tags found.`}</p>
                  </CommandEmpty>
                  <CommandGroup className="p-1.5">
                    {allTags.map((tag) => {
                      const isSelected = selectedTagIds.has(tag.id);
                      return (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => toggleTag(tag.id)}
                          className="gap-2.5 rounded-md px-2 py-1.5 text-xs"
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none size-4" />
                          <span className="truncate">{tag.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                <div className="flex items-center justify-between border-t border px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    {selectedTags.length > 0
                      ? t`${selectedTags.length} selected`
                      : t`No filters active`}
                  </p>
                  {selectedTags.length > 0 && (
                    <Button
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={clearFilters}
                    >
                      <Trans>Clear</Trans>
                    </Button>
                  )}
                </div>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {isTagsFeatureEnabled && selectedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedTags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-surface-400/80"
            >
              <span className="max-w-[130px] truncate">{tag.name}</span>
              <i className="ri-close-line text-[12px] text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
