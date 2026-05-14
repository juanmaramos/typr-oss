import { useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { confirm } from "@tauri-apps/plugin-dialog";

import { debugLog } from "@/components/utils/debug-logger";
import { useTypr } from "@/contexts";
import { deleteSessionWithWelcomeDismissal } from "@/utils/delete-session";
import { removeSessionsFromCache } from "@/utils/session-cache";
import { commands as miscCommands } from "@typr/plugin-misc";
import { Button } from "@typr/ui/components/ui/button";
import { useSession } from "@typr/utils/contexts";

export function DeleteNoteButton() {
  const param = useParams({ from: "/app/note/$id", shouldThrow: false });
  return param ? <DeleteNoteButtonInNote /> : null;
}

function DeleteNoteButtonInNote() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { thankYouSessionId } = useTypr();

  const navigate = useNavigate();
  const param = useParams({ from: "/app/note/$id", shouldThrow: true });

  const hasContent = useSession(
    param.id,
    (s) =>
      !!s.session?.title
      || !!s.session?.raw_memo_html
      || !!s.session?.enhanced_memo_html,
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteSessionWithWelcomeDismissal(param.id, thankYouSessionId),
    onSuccess: () => {
      debugLog("[DeleteNoteButton] DB delete success", { sessionId: param.id });
      removeSessionsFromCache(queryClient, [param.id]);
      navigate({ to: "/app" });
      miscCommands.deleteSessionFolder(param.id).catch((error) => {
        console.warn("Failed to delete session folder:", error);
      });
    },
    onError: (error) => {
      console.error("Failed to delete session:", error);
      debugLog("[DeleteNoteButton] DB delete failed", { sessionId: param.id, error });
    },
  });

  const handleDelete = () => {
    confirm(t`Are you sure you want to delete this note?`).then((yes) => {
      if (yes) {
        debugLog("[DeleteNoteButton] deleting", { sessionId: param.id });
        deleteMutation.mutate();
      }
    });
  };

  return (
    <Button
      disabled={!hasContent}
      variant="ghost"
      size="icon"
      aria-label={t`Delete Note`}
      onClick={handleDelete}
    >
      <i className="ri-delete-bin-line text-lg text-muted-foreground"></i>
    </Button>
  );
}
