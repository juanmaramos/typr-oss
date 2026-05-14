import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { motion } from "motion/react";
import { useCallback, useState } from "react";

import { MODEL_CATEGORY_ICONS } from "@/components/transcript/constants/languageData";
import { useTypr, useRightPanel } from "@/contexts";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import { useModelState } from "@/hooks/useModelState";
import { AUDIO_EXTENSIONS, useUploadAudio } from "@/hooks/useUploadAudio";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@typr/ui/components/ui/dialog";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";

interface AudioUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, upload targets this existing session. Otherwise a new session is created. */
  sessionId?: string;
}

export function AudioUploadDialog({ open, onOpenChange, sessionId: externalSessionId }: AudioUploadDialogProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { userId } = useTypr();
  const { showFloatingDock } = useRightPanel();
  const { openDialog } = useSettingsDialog();
  const { isSttModelAvailable, isSttLoading, selectedCloudModel, models } = useModelState();
  const anyLocalModelDownloaded = models.some(m => m.isDownloaded);
  // Cloud model users don't need a local model downloaded
  const needsLocalModel = !isSttLoading && !anyLocalModelDownloaded && !selectedCloudModel;

  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(externalSessionId ?? null);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { upload, reset: _, isProcessing } = useUploadAudio();

  const resolveSession = useCallback(async (): Promise<string> => {
    if (externalSessionId) {
      console.log("[AudioUpload:resolveSession] reusing externalSessionId:", externalSessionId);
      return externalSessionId;
    }
    if (resolvedSessionId) {
      console.log("[AudioUpload:resolveSession] reusing resolvedSessionId:", resolvedSessionId);
      return resolvedSessionId;
    }
    const sessionId = crypto.randomUUID();
    console.log("[AudioUpload:resolveSession] CREATING NEW session:", sessionId);
    await dbCommands.upsertSession({
      id: sessionId,
      user_id: userId,
      created_at: new Date().toISOString(),
      visited_at: new Date().toISOString(),
      calendar_event_id: null,
      space_id: null,
      title: "",
      raw_memo_html: "",
      enhanced_memo_html: null,
      auto_enhanced_memo_html: null,
      words: [],
      record_start: null,
      record_end: null,
      pre_meeting_memo_html: null,
      source_type: "audio_upload",
      source_metadata: null,
      needs_enhance: false,
    });
    await dbCommands.sessionAddParticipant(sessionId, userId);
    setResolvedSessionId(sessionId);
    console.log("[AudioUpload:resolveSession] session created and state set:", sessionId);
    return sessionId;
  }, [externalSessionId, resolvedSessionId, userId]);

  const applyFile = (path: string) => {
    const name = path.split(/[/\\]/).pop() ?? path;
    setSelectedFile({ path, name });
  };

  const handleBrowse = async () => {
    const result = await openFilePicker({
      title: t`Select Audio File`,
      multiple: false,
      directory: false,
      filters: [{ name: t`Audio`, extensions: AUDIO_EXTENSIONS }],
    });
    if (result && !Array.isArray(result)) {
      applyFile(result);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) {
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !AUDIO_EXTENSIONS.includes(ext)) {
      toast({
        id: "audio-upload-type",
        title: t`Unsupported file type`,
        content: t`Supported: ${AUDIO_EXTENSIONS.join(", ")}`,
        dismissible: true,
      });
      return;
    }
    // Tauri's WebKit webview doesn't expose File.path like Electron does.
    // Read the file data and write to a temp file so we have an on-disk path.
    // We use $APPDATA which is already in the fs write scope.
    try {
      const arrayBuffer = await file.arrayBuffer();
      const appData = await appDataDir();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uploadsDir = await join(appData, "uploads");
      await mkdir(uploadsDir, { recursive: true });
      const path = await join(uploadsDir, `typr_upload_${Date.now()}_${safeName}`);
      await writeFile(path, new Uint8Array(arrayBuffer));
      setSelectedFile({ path, name: file.name });
    } catch (err) {
      console.error("[AudioUpload] drop write failed:", err);
      toast({
        id: "audio-upload-drop-error",
        title: t`Upload failed`,
        content: t`Something went wrong`,
        dismissible: true,
      });
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) {
      return;
    }

    // Gate 1: No model at all
    if (!isSttLoading && !isSttModelAvailable) {
      toast({
        id: "audio-upload-no-model",
        title: t`No transcription model available`,
        content: t`Download a speech-to-text model to transcribe audio files.`,
        buttons: [{ label: t`Open Settings`, onClick: () => openDialog("ai", null, "transcription") }],
        dismissible: true,
      });
      return;
    }

    console.log("[AudioUpload] starting — file:", selectedFile);
    try {
      const targetSessionId = await resolveSession();
      console.log("[AudioUpload] session resolved:", targetSessionId);

      // Close the dialog immediately — progress continues in background via Sonner toast
      console.log(
        "[AudioUpload:handleProcess] resetting resolvedSessionId from",
        resolvedSessionId,
        "to",
        externalSessionId ?? null,
        "(upload targets:",
        targetSessionId,
        ")",
      );
      setSelectedFile(null);
      setResolvedSessionId(externalSessionId ?? null);
      onOpenChange(false);

      // Navigate to the session right away so user can see progress
      if (!externalSessionId) {
        navigate({ to: "/app/note/$id", params: { id: targetSessionId } });
        showFloatingDock("transcript");
      }

      // Fire-and-forget — the AudioUploadToastObserver handles progress/completion UX
      upload(selectedFile.path, selectedFile.name, targetSessionId).catch((error) => {
        console.error("[AudioUpload] failed:", error);
        const msg = error instanceof Error ? error.message : "";
        const isNoModel = msg.includes("Model file not found") || msg.includes("not found")
          || msg.includes("NotSupported");
        toast({
          id: "audio-upload-error",
          title: isNoModel ? t`No transcription model available` : t`Upload failed`,
          content: isNoModel
            ? t`Download a speech-to-text model in Settings → AI models to transcribe audio files.`
            : msg || t`Something went wrong`,
          dismissible: true,
        });
      });
    } catch (error) {
      console.error("[AudioUpload] session creation failed:", error);
      toast({
        id: "audio-upload-error",
        title: t`Upload failed`,
        content: t`Something went wrong`,
        dismissible: true,
      });
    }
  };

  const handleCancel = () => {
    console.log(
      "[AudioUpload:handleCancel] resetting resolvedSessionId from",
      resolvedSessionId,
      "to",
      externalSessionId ?? null,
    );
    setSelectedFile(null);
    setResolvedSessionId(externalSessionId ?? null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-left">
              <Trans>Upload Audio for Transcription</Trans>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          <motion.div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBrowse}
            animate={isDragging ? "dragging" : "idle"}
            variants={{
              idle: { scale: 1 },
              dragging: { scale: 1.01 },
            }}
            transition={{ duration: 0.15 }}
            className={cn(
              "flex flex-col items-center justify-center gap-4 rounded-xl px-6 py-8 text-center transition-colors cursor-pointer",
              isDragging
                ? "bg-muted/60 border-2 border-dashed border-foreground/20"
                : "bg-muted/30 border-2 border-dashed border-muted-foreground/15 hover:bg-muted/50 hover:border-muted-foreground/25",
            )}
          >
            {selectedFile
              ? (
                <>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-background border shadow-sm">
                    <i className="ri-file-music-line text-lg text-muted-foreground/70" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-medium text-foreground truncate max-w-[240px]">
                      {selectedFile.name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                      <Trans>Change file</Trans>
                    </button>
                  </div>
                </>
              )
              : (
                <>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-background border shadow-sm">
                    <i className="ri-upload-cloud-2-line text-lg text-muted-foreground/70" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm text-foreground">
                      <Trans>
                        Drop here or{" "}
                        <span className="underline underline-offset-2 decoration-muted-foreground/50">browse</span>
                      </Trans>
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      {AUDIO_EXTENSIONS.map(e => `.${e}`).join(" · ")}
                    </p>
                  </div>
                </>
              )}
          </motion.div>

          {/* Active model info */}
          {isSttModelAvailable && !isSttLoading && !needsLocalModel && (
            <div className="flex flex-col gap-1 px-1 text-xs text-muted-foreground/70">
              {selectedCloudModel
                ? (
                  <>
                    <div className="flex items-center gap-2">
                      <i className="ri-cloud-line shrink-0" />
                      <span>
                        <Trans>Cloud · typically 1–3 min</Trans>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-lock-line shrink-0" />
                      <span>
                        <Trans>Your data is never used to train AI</Trans>
                      </span>
                    </div>
                  </>
                )
                : (
                  <>
                    <div className="flex items-center gap-2">
                      <i className={`${MODEL_CATEGORY_ICONS.local} shrink-0`} />
                      <span>
                        <Trans>Local · typically 5–15 min</Trans>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="ri-wifi-off-fill shrink-0" />
                      <span>
                        <Trans>Works without internet</Trans>
                      </span>
                    </div>
                  </>
                )}
            </div>
          )}

          {/* No local model warning */}
          {needsLocalModel && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <i className="ri-error-warning-line text-sm mt-0.5 shrink-0" />
              <div>
                <Trans>
                  Audio upload requires a downloaded local model.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 font-medium"
                    onClick={() => openDialog("ai", null, "transcription")}
                  >
                    Download one in Settings
                  </button>
                </Trans>
              </div>
            </div>
          )}

          {/* Already processing warning */}
          {isProcessing && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <i className="ri-loader-4-line text-sm mt-0.5 shrink-0 animate-spin" />
              <div>
                <Trans>An audio file is already being transcribed. Please wait for it to finish.</Trans>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleProcess} disabled={!selectedFile || isProcessing || needsLocalModel}>
              <Trans>Transcribe</Trans>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
