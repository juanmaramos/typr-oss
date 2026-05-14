import { commands as dbCommands, type Word } from "@typr/plugin-db";
import { invoke } from "@tauri-apps/api/core";

// Types
export interface YouTubeVideoInfo {
  title?: string;
  duration?: number;
  transcript: TranscriptSegment[];
}

interface TranscriptSegment {
  text: string;
  start_ms?: number;
  end_ms?: number;
  speaker?: number;
  confidence?: number;
}

export interface VideoTranscript {
  videoId: string;
  title: string;
  duration?: number;
  words: Word[];
}

// Using Word and SpeakerIdentity types from @typr/plugin-db

// Error Types
export enum YouTubeImportError {
  INVALID_URL = "Please enter a valid YouTube URL",
  NO_TRANSCRIPT = "This video doesn't have captions available",
  PRIVATE_VIDEO = "Cannot access this video",
  RATE_LIMITED = "Too many requests, please try again later",
  VIDEO_TOO_LONG = "Video is too long (max 3 hours)",
  NETWORK_ERROR = "Network error, please check your connection",
  UNKNOWN_ERROR = "An unexpected error occurred",
}

export class YouTubeImportService {
  private static readonly MAX_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
  private static readonly URL_REGEX =
    /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

  /**
   * Validate YouTube URL format
   */
  static validateUrl(url: string): boolean {
    return this.URL_REGEX.test(url.trim());
  }

  /**
   * Extract video ID from YouTube URL
   */
  static extractVideoId(url: string): string | null {
    const match = url.match(this.URL_REGEX);
    const videoId = match ? match[3] : null;
    console.log("🎬 [YouTube] Extract video ID:", { url, videoId });
    return videoId;
  }

  /**
   * Extract transcript from YouTube video
   */
  static async extractTranscript(url: string): Promise<VideoTranscript> {
    console.log("🎬 [YouTube] Start extractTranscript:", url);

    if (!this.validateUrl(url)) {
      console.log("❌ [YouTube] Invalid URL format");
      throw new Error(YouTubeImportError.INVALID_URL);
    }

    const videoId = this.extractVideoId(url);
    if (!videoId) {
      console.log("❌ [YouTube] Failed to extract video ID");
      throw new Error(YouTubeImportError.INVALID_URL);
    }

    try {
      console.log("🔄 [YouTube] Calling Tauri extract_youtube_transcript...");
      const videoInfo = await invoke<YouTubeVideoInfo>("extract_youtube_transcript", { url });
      console.log("✅ [YouTube] Tauri response:", {
        title: videoInfo.title,
        duration: videoInfo.duration,
        transcriptLength: videoInfo.transcript?.length,
      });

      if (!videoInfo.transcript || videoInfo.transcript.length === 0) {
        console.log("❌ [YouTube] No transcript found");
        throw new Error(YouTubeImportError.NO_TRANSCRIPT);
      }

      // Check video length
      if (videoInfo.duration && videoInfo.duration > this.MAX_DURATION_MS) {
        console.log("❌ [YouTube] Video too long:", videoInfo.duration);
        throw new Error(YouTubeImportError.VIDEO_TOO_LONG);
      }

      const result = {
        videoId,
        title: videoInfo.title || "YouTube video",
        duration: videoInfo.duration,
        words: this.transformTranscriptToWords(videoInfo.transcript, "temp-session-id"),
      };
      console.log("✅ [YouTube] Transcript extracted successfully:", {
        title: result.title,
        wordsCount: result.words.length,
      });

      return result;
    } catch (error) {
      console.log("❌ [YouTube] Extract error:", error);
      throw this.handleTauriError(error);
    }
  }

  /**
   * Create session from video transcript
   * Follow the same pattern as app/new route
   */
  static async createSession(transcript: VideoTranscript, userId: string, originalUrl?: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    console.log("🏗️ [YouTube] Start createSession:", { sessionId, title: transcript.title, userId });

    try {
      // Step 1: Create session with empty words (like existing code)
      console.log("📝 [YouTube] Creating session...");
      const session = await dbCommands.upsertSession({
        id: sessionId,
        user_id: userId,
        created_at: new Date().toISOString(),
        visited_at: new Date().toISOString(),
        calendar_event_id: null,
        space_id: null,
        title: transcript.title,
        raw_memo_html: originalUrl ? `<p><strong>Source:</strong> <a href="${originalUrl}">${originalUrl}</a></p>` : "",
        enhanced_memo_html: null,
        auto_enhanced_memo_html: null,
        words: [], // Empty initially, like existing pattern
        record_start: null, // Could store video start time for duration calc
        record_end: null, // Could store video end time for duration calc
        pre_meeting_memo_html: null,
        source_type: "youtube",
        source_metadata: JSON.stringify({
          videoId: this.extractVideoId(originalUrl || ""),
          originalUrl: originalUrl,
          duration: transcript.duration,
          importedAt: new Date().toISOString(),
        }),
        needs_enhance: false,
      });
      console.log("✅ [YouTube] Session created:", session.id);

      // Step 2: Add user as participant
      console.log("👤 [YouTube] Adding participant...");
      await dbCommands.sessionAddParticipant(sessionId, userId);
      console.log("✅ [YouTube] Participant added");

      // Step 3: Words are already in correct format from transcript transformation
      console.log("🔄 [YouTube] Using words from transcript...");
      const words = transcript.words;
      console.log("✅ [YouTube] Words ready:", words.length);

      // Step 4: Update session with words (separate operation)
      console.log("💾 [YouTube] Updating session with words...");
      console.log("💾 [YouTube] Sample word being stored:", words[0]);

      const updatedSession = await dbCommands.upsertSession({
        ...session,
        words,
        needs_enhance: true,
      });
      console.log("✅ [YouTube] Session updated with words");
      console.log("✅ [YouTube] Updated session words count:", updatedSession.words?.length || 0);

      // TEST: Immediately verify the words were stored
      console.log("🧪 [YouTube] Testing: Fetching session back immediately...");
      const testSession = await dbCommands.getSession({ id: sessionId });
      console.log("🧪 [YouTube] Test result - words in fetched session:", testSession?.words?.length || 0);

      if (testSession?.words && testSession.words.length > 0) {
        console.log("🧪 [YouTube] Test sample word:", testSession.words[0]);
      } else {
        console.log("❌ [YouTube] CRITICAL: Words lost in database!");
      }

      // Step 5: Auto-add "YouTube" tag
      try {
        const tag = await dbCommands.upsertTag({ id: crypto.randomUUID(), name: "YouTube" });
        await dbCommands.assignTagToSession(tag.id, sessionId);
        console.log("🏷️ [YouTube] Tag 'YouTube' assigned to session");
      } catch (tagError) {
        console.warn("⚠️ [YouTube] Failed to assign YouTube tag:", tagError);
      }

      return session.id;
    } catch (error) {
      console.error("❌ [YouTube] Failed to create session:", error);
      throw new Error("Failed to create session from transcript");
    }
  }

  /**
   * Complete YouTube import flow
   */
  static async importVideo(url: string, userId: string): Promise<string> {
    const transcript = await this.extractTranscript(url);
    return await this.createSession(transcript, userId, url);
  }

  /**
   * Transform transcript segments to individual Word objects
   * CRITICAL: Split segments into individual words to match expected schema
   */
  private static transformTranscriptToWords(segments: TranscriptSegment[], sessionId: string): Word[] {
    console.log("🔄 [YouTube] Transforming segments to individual words:", segments.length);

    const words: Word[] = [];

    segments.forEach((segment, segmentIndex) => {
      if (!segment.text?.trim()) {
        return;
      }

      // Split segment text into individual words
      const individualWords = segment.text.trim().split(/\s+/);
      const segmentDuration = (segment.end_ms || 0) - (segment.start_ms || 0);
      const wordDuration = individualWords.length > 0 ? segmentDuration / individualWords.length : 0;

      individualWords.forEach((wordText, wordIndex) => {
        const wordStartMs = (segment.start_ms || 0) + (wordIndex * wordDuration);
        const wordEndMs = wordStartMs + wordDuration;

        words.push({
          text: wordText,
          speaker: {
            type: "unassigned" as const,
            value: { index: 0 }, // Single speaker for YouTube videos
          } as const,
          confidence: segment.confidence || 1.0,
          start_ms: Math.round(wordStartMs),
          end_ms: Math.round(wordEndMs),
        });
      });
    });

    console.log("✅ [YouTube] Transformed", segments.length, "segments into", words.length, "individual words");
    console.log("✅ [YouTube] Sample individual word:", words[0]);
    return words;
  }

  /**
   * Handle and transform Tauri errors to user-friendly messages
   */
  private static handleTauriError(error: unknown): Error {
    const errorStr = String(error);

    if (errorStr.includes("429") || errorStr.includes("rate limit")) {
      return new Error(YouTubeImportError.RATE_LIMITED);
    }
    if (errorStr.includes("403") || errorStr.includes("private")) {
      return new Error(YouTubeImportError.PRIVATE_VIDEO);
    }
    if (errorStr.includes("404") || errorStr.includes("not found")) {
      return new Error(YouTubeImportError.NO_TRANSCRIPT);
    }
    if (errorStr.includes("network") || errorStr.includes("connection")) {
      return new Error(YouTubeImportError.NETWORK_ERROR);
    }

    console.error("YouTube import error:", error);
    return new Error(YouTubeImportError.UNKNOWN_ERROR);
  }
}
