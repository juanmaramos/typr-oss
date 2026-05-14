import { useTranscript } from "./useTranscript";

// Uses React Query to ensure session data is loaded before accessing transcript
export function useTranscriptWidget(sessionId: string | null) {
  const { words, isLive, selectedLanguage, handleLanguageChange } = useTranscript(sessionId, "widget");

  const hasTranscript = words.length > 0;
  const isSessionActive = sessionId && (hasTranscript || isLive);

  const showEmptyMessage = sessionId && !hasTranscript && !isLive;

  return {
    words,
    isLive,
    selectedLanguage,
    handleLanguageChange,
    hasTranscript,
    isSessionActive,
    showEmptyMessage,
  };
}
