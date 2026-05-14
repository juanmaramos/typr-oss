import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { Trans } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useMemo } from "react";

import { useSession } from "@typr/utils/contexts";
import { noteHeaderChipClassName } from "../styles";

interface YouTubeChipProps {
  sessionId: string;
}

/**
 * Extracts YouTube URL from session's raw_memo_html
 * Expected format: <p><strong>Source:</strong> <a href="YOUTUBE_URL">YOUTUBE_URL</a></p>
 */
function extractYouTubeUrl(rawMemoHtml: string): string | null {
  if (!rawMemoHtml) {
    return null;
  }

  // Match YouTube URLs in href attributes
  const urlMatch = rawMemoHtml.match(/href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^"]+)"/i);
  return urlMatch ? urlMatch[1] : null;
}

/**
 * Checks if a session is from YouTube import
 * Detection methods:
 * 1. Title starts with "YT: " prefix
 * 2. raw_memo_html contains YouTube source link
 */
function isYouTubeSession(title: string | null, rawMemoHtml: string | null): boolean {
  if (rawMemoHtml && extractYouTubeUrl(rawMemoHtml)) {
    return true;
  }
  return false;
}

/**
 * Gets original YouTube video title
 * Removes "YT: " prefix to show the original video title
 */
function getOriginalYouTubeTitle(title: string | null): string {
  if (!title) {
    return "YouTube Video";
  }
  return title;
}

export function YouTubeChip({ sessionId }: YouTubeChipProps) {
  const session = useSession(sessionId, (s) => ({
    title: s.session?.title,
    rawMemoHtml: s.session?.raw_memo_html,
    sourceType: s.session?.source_type,
    sourceMetadata: s.session?.source_metadata,
  }));

  const youtubeData = useMemo(() => {
    const { title, rawMemoHtml, sourceType, sourceMetadata } = session;

    // Check if this is a YouTube session using structured metadata (preferred)
    if (sourceType === "youtube") {
      try {
        const metadata = sourceMetadata ? JSON.parse(sourceMetadata) : {};
        return {
          url: metadata.originalUrl || extractYouTubeUrl(rawMemoHtml || ""),
          originalTitle: getOriginalYouTubeTitle(title),
          videoId: metadata.videoId,
          duration: metadata.duration,
          importedAt: metadata.importedAt,
        };
      } catch (error) {
        console.warn("Failed to parse YouTube metadata:", error);
        // Fallback to legacy detection
      }
    }

    // Legacy fallback for existing YouTube imports without structured metadata
    if (!isYouTubeSession(title, rawMemoHtml)) {
      return null;
    }

    return {
      url: extractYouTubeUrl(rawMemoHtml || ""),
      originalTitle: getOriginalYouTubeTitle(title),
    };
  }, [session]);

  const handleClick = useCallback(async () => {
    if (youtubeData?.url) {
      try {
        await openUrl(youtubeData.url);
      } catch (error) {
        console.error("Failed to open YouTube URL:", error);
      }
    }
  }, [youtubeData?.url]);

  // Don't render if not a YouTube session
  if (!youtubeData) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={noteHeaderChipClassName}
            disabled={!youtubeData.url}
          >
            <i className="ri-youtube-fill text-base text-red-500"></i>
            <span className="text-sm">
              <Trans>YouTube</Trans>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1 max-w-sm">
            <p className="font-medium">
              <Trans>YouTube Video</Trans>
            </p>
            <p className="text-sm text-muted-foreground/70 truncate">
              {youtubeData.originalTitle}
            </p>
            {youtubeData.url && (
              <p className="text-xs text-muted-foreground truncate">
                <Trans>Click to open in browser</Trans>
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
