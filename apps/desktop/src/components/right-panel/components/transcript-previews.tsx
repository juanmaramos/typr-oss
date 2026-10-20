import { Trans, useLingui } from "@lingui/react/macro";
import type { Word } from "@typr/plugin-listener";

// Interim hypotheses never enter TranscriptEditor or its persistence callback.
export function TranscriptPreviews({ previews }: { previews: Record<string, Word[]> }) {
  const { t } = useLingui();
  const channels = Object.entries(previews).filter(([, words]) => words.length > 0);
  if (channels.length === 0) {
    return null;
  }

  return (
    <div
      className="max-h-32 shrink-0 overflow-y-auto border-t border-border px-4 py-3 text-ui-body text-muted-foreground"
      aria-label={t`Interim transcription`}
    >
      <p className="mb-1 text-ui-caption">
        <Trans>Live preview · may change</Trans>
      </p>
      {channels.map(([channel, words]) => <p key={channel}>{words.map(word => word.text).join(" ")}</p>)}
    </div>
  );
}
