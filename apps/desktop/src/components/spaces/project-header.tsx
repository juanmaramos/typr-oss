import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Input } from "@typr/ui/components/ui/input";
import { Textarea } from "@typr/ui/components/ui/textarea";
import { Trans, useLingui } from "@lingui/react/macro";

interface ProjectHeaderProps {
  description: string;
  isDeleting?: boolean;
  name: string;
  onDelete: () => void;
  onDescriptionBlur: () => void;
  onDescriptionChange: (value: string) => void;
  onNameBlur: () => void;
  onNameChange: (value: string) => void;
}

export function ProjectHeader({
  description,
  isDeleting = false,
  name,
  onDelete,
  onDescriptionBlur,
  onDescriptionChange,
  onNameBlur,
  onNameChange,
}: ProjectHeaderProps) {
  const { t } = useLingui();
  return (
    <div className="mb-8 flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-4">
          <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--sidebar-accent))]/70 ring-1 ring-[hsl(var(--sidebar-primary))]/10">
            <i className="ri-folder-3-line text-[20px] text-[hsl(var(--sidebar-primary))]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              <Trans>Project</Trans>
            </div>
            <Input
              value={name}
              onChange={event => onNameChange(event.target.value)}
              onBlur={onNameBlur}
              className="mt-1 h-auto border-none px-0 text-[32px] font-semibold tracking-tight text-foreground shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

        <Textarea
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          onBlur={onDescriptionBlur}
          placeholder={t`Add a description`}
          className="mt-4 min-h-[44px] max-w-2xl resize-none border-none px-0 text-[15px] leading-7 text-muted-foreground shadow-none focus-visible:ring-0"
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
            <i className="ri-delete-bin-line text-[15px]" />
            <Trans>Delete project</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
