import { ProjectIconPicker } from "@/components/projects/project-icon-picker";
import type { ProjectIconColor, ProjectIconValue } from "@/components/projects/project-icons";
import { PROJECT_DESCRIPTION_MAX_LENGTH } from "@/lib/projects";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Textarea } from "@typr/ui/components/ui/textarea";
import { Trans, useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

const PROJECT_DESCRIPTION_MAX_HEIGHT_PX = 120;

interface ProjectHeaderProps {
  description: string;
  iconColor?: string | null;
  iconValue?: string | null;
  isDeleting?: boolean;
  name: string;
  onDelete: () => void;
  onDescriptionBlur: () => void;
  onDescriptionChange: (value: string) => void;
  onIconChange: (next: { icon: ProjectIconValue; color: ProjectIconColor }) => void;
  onNameBlur: () => void;
  onNameChange: (value: string) => void;
  onNameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function ProjectHeader({
  description,
  iconColor,
  iconValue,
  isDeleting = false,
  name,
  onDelete,
  onDescriptionBlur,
  onDescriptionChange,
  onIconChange,
  onNameBlur,
  onNameChange,
  onNameKeyDown,
}: ProjectHeaderProps) {
  const { t } = useLingui();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = descriptionRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, PROJECT_DESCRIPTION_MAX_HEIGHT_PX);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > PROJECT_DESCRIPTION_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [description]);

  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-4">
          <ProjectIconPicker
            icon={iconValue}
            color={iconColor}
            onChange={onIconChange}
            triggerClassName="mt-1"
          />

          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              <Trans>Project</Trans>
            </div>
            <input
              type="text"
              value={name}
              onChange={event => onNameChange(event.target.value)}
              onBlur={onNameBlur}
              onKeyDown={onNameKeyDown}
              className="typography-title mt-1 w-full border-none bg-transparent px-0 text-foreground transition-opacity duration-200 placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </div>
        </div>

        <Textarea
          ref={descriptionRef}
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          onBlur={onDescriptionBlur}
          placeholder={t`Add a description`}
          maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
          className="mt-4 min-h-7 max-w-2xl resize-none overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 h-10 w-10 rounded-full text-muted-foreground hover:bg-surface-400 hover:text-foreground"
            aria-label={t`Project actions`}
          >
            <i className="ri-more-2-fill text-lg" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-xl border bg-background p-1.5">
          <DropdownMenuItem
            onSelect={onDelete}
            disabled={isDeleting}
            className="rounded-lg text-sm text-destructive focus:bg-destructive/5 focus:text-destructive"
          >
            <i className="ri-delete-bin-line text-sm" />
            <Trans>Delete project</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
