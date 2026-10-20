import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef } from "react";

import { commands, type CallEndStatus } from "@typr/plugin-notification";
import { Button } from "@typr/ui/components/ui/button";

import { CallEndPermissionNotice, useCallEndStatus } from "./call-end-permission";

// Mounted once in the main window. The native service owns association and timing.
export function CallEndBridge() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const titleId = useId();
  const lastPrompt = useRef<string | null>(null);
  const enabled = useQuery({
    queryKey: ["notification", "call-end"],
    queryFn: () => commands.getCallEndEnabled(),
  });
  const statusQuery = useCallEndStatus(enabled.data === true);
  const status = enabled.data === true ? statusQuery.data : undefined;
  const action = useMutation({
    mutationFn: async (operation: () => Promise<null>) => operation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification", "call-end-status"] }),
  });

  useEffect(() => {
    const prompt = getPrompt(status);
    const key = prompt ? `${prompt.session_id}:${prompt.type}` : null;
    if (key === lastPrompt.current) return;
    lastPrompt.current = key;
    action.reset();
    if (!prompt || document.hasFocus()) return;

    const title = prompt.type === "association_required"
      ? t`Link this recording to a call?`
      : prompt.type === "uncertain"
      ? t`Is your call still going?`
      : t`Call ended`;
    const message = prompt.type === "countdown"
      ? t`Recording will stop soon. Open Typr to keep recording.`
      : t`Open Typr to choose what happens to this recording.`;
    void commands.showCallEndNotification(prompt.session_id, title, message).catch(() => {
      // The same controls remain available in the main window if notifications are unavailable.
    });
  }, [status, t]);

  if (status?.type === "permission_required") {
    return (
      <section aria-labelledby={titleId}
        className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] space-y-3 rounded-lg border bg-background p-4 shadow-lg">
        <h2 id={titleId} className="text-sm font-semibold"><Trans>Accessibility permission needed</Trans></h2>
        <CallEndPermissionNotice />
      </section>
    );
  }

  const prompt = getPrompt(status);
  if (!prompt) return null;
  const finishing = prompt.type === "countdown" && prompt.remaining_seconds === 0;
  const busy = action.isPending || finishing;
  const keepRecording = () => action.mutate(() => commands.keepRecording(prompt.session_id));
  const candidates = prompt.type === "association_required" ? prompt.candidates : [];
  const identifiable = candidates.filter(source => candidates.filter(other => other.label === source.label).length === 1);

  return (
    <section
      aria-labelledby={titleId}
      className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] space-y-3 rounded-lg border bg-background p-4 shadow-lg"
    >
      <h2 id={titleId} className="text-sm font-semibold">
        {prompt.type === "association_required"
          ? <Trans>Link this recording to a call?</Trans>
          : prompt.type === "uncertain"
          ? <Trans>Is your call still going?</Trans>
          : finishing
          ? <Trans>Finishing recording…</Trans>
          : <Trans>Call ended</Trans>}
      </h2>
      <p className="text-sm text-muted-foreground" role="status">
        {prompt.type === "association_required"
          ? <Trans>Choose a call to stop recording two minutes after it ends.</Trans>
          : prompt.type === "uncertain"
          ? <Trans>We can’t confirm whether {prompt.source.label} ended. Recording will continue until you choose.</Trans>
          : finishing
          ? <Trans>Saving the rest of your transcript.</Trans>
          : <Trans>Recording will stop when the countdown ends. Rejoining the call cancels it.</Trans>}
      </p>
      {prompt.type === "countdown" && !finishing && (
        <p className="text-lg font-medium tabular-nums" aria-label={t`Time until recording stops`}>
          {Math.floor(prompt.remaining_seconds / 60)}:{String(prompt.remaining_seconds % 60).padStart(2, "0")}
        </p>
      )}
      {prompt.type === "association_required" && (
        <div className="space-y-2">
          {identifiable.length !== candidates.length && (
            <p className="text-sm text-muted-foreground"><Trans>More than one call is open in the same app. Keep only the call you want to link open, or keep recording independently.</Trans></p>
          )}
          <div className="flex flex-wrap gap-2">
            {identifiable.map((source) => (
              <Button key={source.id} size="sm" variant="outline" disabled={busy}
                onClick={() => action.mutate(() => commands.associateCall(prompt.session_id, source.id))}>
                {source.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={keepRecording}>
          <Trans>Keep recording</Trans>
        </Button>
        {prompt.type !== "association_required" && (
          <Button size="sm" disabled={busy}
            onClick={() => action.mutate(() => commands.stopAssociatedRecording(prompt.session_id))}>
            <Trans>Stop now</Trans>
          </Button>
        )}
      </div>
      {action.isError && <p className="text-sm text-destructive" role="alert"><Trans>Couldn’t update call controls. Try again.</Trans></p>}
    </section>
  );
}

function getPrompt(status: CallEndStatus | undefined) {
  return status?.type === "association_required" || status?.type === "uncertain" || status?.type === "countdown"
    ? status
    : null;
}
