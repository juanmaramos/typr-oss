export function shouldPersistTranscriptUpdate({
  isLive,
  routeSessionId,
  currentSessionId,
}: {
  isLive: boolean;
  routeSessionId: string | null;
  currentSessionId: string | null;
}) {
  return !!routeSessionId && !isLive && currentSessionId === routeSessionId;
}
