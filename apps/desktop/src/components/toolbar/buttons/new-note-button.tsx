import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { Icon } from "@/components/ui/icon";
import { useNewNote } from "@/contexts";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { ShortcutById } from "../../shortcut-by-id";

export function NewNoteButton() {
  const param = useParams({ from: "/app/note/$id", shouldThrow: false });
  return param ? <NewNoteButtonInNote /> : null;
}

function NewNoteButtonInNote() {
  const param = useParams({ from: "/app/note/$id", shouldThrow: true });

  // ✅ FIXED: Use React Query instead of useSession to avoid race condition crashes
  const sessionQuery = useQuery({
    queryKey: ["session", param.id],
    queryFn: () => dbCommands.getSession({ id: param.id }),
    enabled: !!param.id,
  });

  const disabled = sessionQuery.data
    ? (!sessionQuery.data.title
      && !sessionQuery.data.raw_memo_html
      && !sessionQuery.data.enhanced_memo_html
      && !sessionQuery.data.words.length)
    : true; // Disable while loading

  return <ActualButton disabled={disabled} />;
}

function ActualButton({ disabled }: { disabled: boolean }) {
  const { t } = useLingui();
  const { createNewNote } = useNewNote();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          disabled={disabled}
          variant="ghost"
          size="sm"
          onClick={() => createNewNote("toolbar")}
          aria-label={t`New Note`}
          className="flex h-8 flex-shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-surface-400 hover:text-foreground"
        >
          <Icon name="ri-add-line" className="h-4 w-4" />
          <Trans>New note</Trans>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          <Trans>Create new note</Trans> <ShortcutById shortcutId="new-note" />
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
