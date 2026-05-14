import type { Word } from "@typr/plugin-listener";

export type CommittedWordsState = {
  sessionId: string | null;
  words: Word[];
};

export type PreviewWordsState = {
  sessionId: string | null;
  wordsByChannel: Record<string, Word[]>;
};

export function getSessionScopedWords(state: CommittedWordsState, sessionId: string | null): Word[] {
  return state.sessionId === sessionId ? state.words : [];
}

export function getSessionScopedPreviews(
  state: PreviewWordsState,
  sessionId: string | null,
): Record<string, Word[]> {
  return state.sessionId === sessionId ? state.wordsByChannel : {};
}
