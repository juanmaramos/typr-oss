import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useTypr, useRightPanel } from "@/contexts";
import { YouTubeImportError, YouTubeImportService } from "@/services/youtube-service";
import { captureTelemetryException } from "@/utils/telemetry";
import { toast } from "@typr/ui/components/ui/toast";

interface UseYouTubeImportOptions {
  onSuccess?: (sessionId: string) => void;
  onError?: (error: string) => void;
  autoEnhance?: boolean; // Whether to automatically enhance after import
}

export function useYouTubeImport(options: UseYouTubeImportOptions = {}) {
  const { _ } = useLingui();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const { showFloatingDock } = useRightPanel();

  const importMutation = useMutation({
    mutationFn: async (videoUrl: string) => {
      console.log("🚀 [YouTube Hook] Starting import:", videoUrl);

      if (!videoUrl.trim()) {
        console.log("❌ [YouTube Hook] Empty URL");
        throw new Error("Please enter a YouTube URL");
      }

      console.log("🔄 [YouTube Hook] Calling importVideo service...");
      const sessionId = await YouTubeImportService.importVideo(videoUrl, userId);
      console.log("✅ [YouTube Hook] Import service completed:", sessionId);

      return sessionId;
    },
    onSuccess: async (sessionId: string) => {
      console.log("🎉 [YouTube Hook] Success callback:", sessionId);

      // Clear form state
      setUrl("");
      setError(null);

      // Show success toast
      console.log("🍞 [YouTube Hook] Showing success toast");
      toast({
        id: "youtube-import-success",
        title: _(msg`YouTube Video Imported`),
        content: options.autoEnhance
          ? _(msg`Transcript imported successfully. AI summary is being generated...`)
          : _(msg`Transcript imported successfully. Click 'Enhance' to generate summary.`),
        dismissible: true, // Adds close button
        duration: 5000, // Auto-dismiss after 5 seconds
      });

      // Navigate to session
      console.log("🧭 [YouTube Hook] Navigating to session:", sessionId);
      navigate({ to: "/app/note/$id", params: { id: sessionId } });

      // Invalidate sessions cache to update sidebar and usage counter
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["all-tags"] });
      queryClient.invalidateQueries({ queryKey: ["session-tags", sessionId] });

      // Keep floating bar collapsed — user can expand it when ready
      console.log("📺 [YouTube Hook] Setting transcript view on floating dock...");
      showFloatingDock("transcript");

      // Mark session for auto-enhancement when EditorArea loads
      // needs_enhance flag is now set in the DB by youtube-service.ts
      // Background enhance service will pick it up automatically

      // Call custom success handler
      options.onSuccess?.(sessionId);
      console.log("✅ [YouTube Hook] Import process completed successfully");
    },
    onError: (error: Error) => {
      console.log("💥 [YouTube Hook] Import failed:", error);

      const isKnownUserError = Object.values(YouTubeImportError).includes(error.message as YouTubeImportError)
        || error.message === "Please enter a YouTube URL";

      const errorMessage = isKnownUserError
        ? error.message
        : "Failed to import YouTube video";

      // Report unexpected errors to Sentry — user-facing limit/validation errors are not bugs
      if (!isKnownUserError) {
        captureTelemetryException(error, {
          tags: { feature: "youtube_import" },
        });
      }

      console.log("❌ [YouTube Hook] Setting error:", errorMessage);
      setError(errorMessage);
      options.onError?.(errorMessage);
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    console.log("📤 [YouTube Hook] Form submitted:", url);

    if (!url.trim()) {
      console.log("❌ [YouTube Hook] Empty URL submitted");
      setError("Please enter a YouTube URL");
      return;
    }

    if (!YouTubeImportService.validateUrl(url)) {
      console.log("❌ [YouTube Hook] Invalid URL format");
      setError(YouTubeImportError.INVALID_URL);
      return;
    }

    console.log("🎯 [YouTube Hook] Triggering mutation...");
    setError(null);
    importMutation.mutate(url);
  };

  const handleReset = () => {
    setUrl("");
    setError(null);
    importMutation.reset();
  };

  return {
    // State
    url,
    setUrl,
    error,
    isLoading: importMutation.isPending,

    // Actions
    handleSubmit,
    handleReset,

    // Validation
    isValidUrl: url.trim() ? YouTubeImportService.validateUrl(url) : true,
    canSubmit: url.trim() && YouTubeImportService.validateUrl(url) && !importMutation.isPending,
  };
}
