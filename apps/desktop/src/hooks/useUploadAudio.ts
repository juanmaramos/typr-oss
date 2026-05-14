import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appDataDir } from "@tauri-apps/api/path";
import { useCallback, useRef } from "react";

import { useTypr } from "@/contexts";
import { useAudioUploadStore } from "@/stores/audio-upload";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands, Word } from "@typr/plugin-db";
import { commands as localSttCommands, events as localSttEvents } from "@typr/plugin-local-stt";
import { useSessions } from "@typr/utils/contexts";
import { remove } from "@tauri-apps/plugin-fs";

export const AUDIO_EXTENSIONS = ["wav", "mp3", "ogg", "mp4", "m4a", "flac"];
export const AUDIO_UPLOAD_MONTHLY_LIMIT = 2;

/**
 * Processes an audio file path through local STT, saves the resulting words
 * to the session, and sets the auto-enhance flag so the editor picks it up.
 * File selection is the caller's responsibility (dialog or dropzone).
 *
 * Progress is broadcast via the global `useAudioUploadStore` so other components
 * (toasts, buttons) can react without prop-drilling.
 */
export function useUploadAudio() {
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const setProgress = useAudioUploadStore((s) => s.setProgress);
  const progress = useAudioUploadStore((s) => s.progress);
  const abortRef = useRef(false);
  const insertSession = useSessions((s) => s.insert);

  const audioUploadUsageQuery = useQuery({
    queryKey: ["audio-upload-count", userId],
    queryFn: async () => {
      if (!userId) {
        return 0;
      }

      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const sessions = await dbCommands.listSessions({
        type: "dateRange",
        user_id: userId,
        start: currentMonth.toISOString(),
        end: nextMonth.toISOString(),
        limit: 100,
      });

      return sessions.filter(s => s.source_type === "audio_upload").length;
    },
    enabled: !!userId,
  });

  const upload = useCallback(async (filePath: string, fileName: string, targetSessionId: string): Promise<void> => {
    const currentStatus = useAudioUploadStore.getState().progress.status;
    console.log(
      "[useUploadAudio:upload] called — targetSessionId:",
      targetSessionId,
      "file:",
      fileName,
      "currentStatus:",
      currentStatus,
    );
    if (currentStatus === "processing") {
      console.warn("[useUploadAudio:upload] BLOCKED — another upload already in progress");
      throw new Error("Another audio upload is already in progress");
    }

    abortRef.current = false;
    const startedAt = Date.now();

    // Helper: persist words to DB and invalidate queries
    const saveWords = async (words: Word[], isCloudTranscript: boolean) => {
      console.log("[useUploadAudio:saveWords] READ session:", targetSessionId, "wordCount:", words.length);
      const session = await dbCommands.getSession({ id: targetSessionId });
      if (session) {
        console.log(
          "[useUploadAudio:saveWords] session found — existing words:",
          session.words?.length ?? 0,
          "title:",
          JSON.stringify(session.title),
        );
        const wordsWithSpeaker = words.map((w) => {
          if (w.speaker) {
            // For uploaded audio we don't know who is "You", so offset all
            // cloud speaker indices by 1 so none maps to index 0 ("You").
            if (isCloudTranscript && w.speaker.type === "unassigned") {
              return { ...w, speaker: { type: "unassigned" as const, value: { index: w.speaker.value.index + 1 } } };
            }
            return w;
          }
          // No speaker info at all — label as "Them" (index 1) for uploads
          return { ...w, speaker: { type: "unassigned" as const, value: { index: 1 } } };
        });
        const updatedSession = { ...session, words: wordsWithSpeaker, needs_enhance: true };
        console.log(
          "[useUploadAudio:saveWords] WRITE session:",
          targetSessionId,
          "newWordCount:",
          wordsWithSpeaker.length,
        );
        await dbCommands.upsertSession(updatedSession);
        insertSession(updatedSession);
        await queryClient.invalidateQueries({ queryKey: ["session", targetSessionId] });
        await queryClient.invalidateQueries({ queryKey: ["session", "words", targetSessionId] });
        await queryClient.invalidateQueries({ queryKey: ["audio-upload-count", userId] });
        await queryClient.invalidateQueries({ queryKey: ["sessions"] });
        console.log("[useUploadAudio:saveWords] DONE — queries invalidated for:", targetSessionId);
      } else {
        console.error("[useUploadAudio:saveWords] SESSION NOT FOUND in DB:", targetSessionId);
      }
    };

    // Helper: clean up drag-and-drop temp files
    const cleanupTemp = async () => {
      try {
        const appData = await appDataDir();
        if (filePath.startsWith(appData) && filePath.includes("/uploads/typr_upload_")) {
          await remove(filePath);
        }
      } catch {
        // Best-effort cleanup — ignore errors
      }
    };

    // Determine if a cloud STT model is selected
    const sttModel = await connectorCommands.getSttModel();
    const isCloudModel = sttModel.includes("assemblyai");

    if (isCloudModel) {
      // Cloud path: upload directly to AssemblyAI → poll → words returned directly
      setProgress({
        status: "processing",
        current: 0,
        total: 0,
        startedAt,
        sessionId: targetSessionId,
        fileName,
        indeterminate: true,
      });

      try {
        const words = await connectorCommands.processRecordedCloud(filePath);

        if (abortRef.current) {
          setProgress({ status: "idle" });
          return;
        }

        if (words.length > 0) {
          await saveWords(words as Word[], true);
        }

        setProgress({ status: "done", sessionId: targetSessionId });
      } catch (error) {
        if (!abortRef.current) {
          const msg = error instanceof Error ? error.message : String(error);
          setProgress({ status: "error", sessionId: targetSessionId, message: msg });
        }
        throw error;
      } finally {
        await cleanupTemp();
      }
    } else {
      // Local path: whisper model — words streamed via events
      setProgress({ status: "processing", current: 0, total: 0, startedAt, sessionId: targetSessionId, fileName });

      const collectedWords: Word[] = [];

      console.log("[useUploadAudio] listening for events, calling processRecorded:", filePath);
      const unlisten = await localSttEvents.recordedProcessingEvent.listen((e) => {
        if (abortRef.current) {
          return;
        }
        const { current, total, word } = e.payload.Progress;
        setProgress({ status: "processing", current, total, startedAt, sessionId: targetSessionId, fileName });
        collectedWords.push(word);
      });

      try {
        await localSttCommands.processRecorded(filePath);
        console.log("[useUploadAudio] processRecorded done, words collected:", collectedWords.length);

        if (abortRef.current) {
          setProgress({ status: "idle" });
          return;
        }

        if (collectedWords.length > 0) {
          await saveWords(collectedWords, false);
        }

        setProgress({ status: "done", sessionId: targetSessionId });
      } catch (error) {
        if (!abortRef.current) {
          const msg = error instanceof Error ? error.message : String(error);
          setProgress({ status: "error", sessionId: targetSessionId, message: msg });
        }
        throw error;
      } finally {
        unlisten();
        await cleanupTemp();
      }
    }
  }, [queryClient, setProgress, userId, insertSession]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setProgress({ status: "idle" });
  }, [setProgress]);

  return {
    upload,
    reset,
    state: progress,
    audioUploadCount: audioUploadUsageQuery.data || 0,
    isProcessing: progress.status === "processing",
  };
}
