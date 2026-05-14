/**
 * Typed Analytics Event Registry
 *
 * All analytics events must be defined here. This provides compile-time
 * safety so missing properties or typos are caught before they reach production.
 *
 * Usage:
 *   import { trackEvent } from "@/utils/analytics-events";
 *   trackEvent("chat_message_sent", userId, { model_provider: "OpenRouter", model_name: "..." });
 */

import { safeAnalyticsEvent } from "./analytics-safe";
import { addTelemetryBreadcrumb } from "./telemetry";

// ---------------------------------------------------------------------------
// Event property types
// ---------------------------------------------------------------------------

interface ChatModelInfo {
  model_provider: string;
  model_name: string;
}

interface DocumentImprovement {
  original_length: number;
  improved_length: number;
  method: string;
  session_id: string;
}

interface SttModelChange {
  model: string;
  is_cloud: boolean;
}

interface SttFallbackSuccess {
  error_type: string;
  failed_model: string;
  fallback_model: string;
}

interface SttFallbackFailed {
  error_type: string;
  failed_model: string;
  reason: string;
}

interface WritingInitiated {
  text_length: number;
  session_id: string;
}

interface SessionRef {
  session_id: string;
}

interface ProjectRef {
  project_id: string;
}

interface ProjectCreated extends ProjectRef {
  source: "project_dialog" | "note_header";
  has_description: boolean;
}

interface ProjectSourceStatusChanged extends ProjectRef {
  status: "Included" | "ExcludedFromBrief" | "NeedsReview";
}

interface ProjectNotesAdded extends ProjectRef {
  note_count: number;
  source: "project_picker" | "note_header" | "bulk_action";
}

interface ProjectFilesAdded extends ProjectRef {
  file_count: number;
  saved_count: number;
  failed_count: number;
}

interface ProjectFileAction extends ProjectRef {
  status: string;
}

interface ProjectBriefRefresh extends ProjectRef {
  trigger: "auto" | "manual";
  source_count: number;
  status: "requested" | "queued" | "skipped" | "success" | "failed";
}

interface AskThreadCreated extends ProjectRef {
  source: "project_launcher" | "ask_home" | "thread_new_chat";
  has_initial_prompt: boolean;
}

interface AskMessageSent {
  thread_id: string;
  project_id?: string;
  prompt_length: number;
  model_id: string;
}

interface AskAnswerGenerated {
  thread_id: string;
  project_id?: string;
  model_id: string;
  source_count: number;
  status: "success" | "failed";
}

interface AskSourceOpened {
  thread_id: string;
  project_id?: string;
  source_type: "note" | "file";
}

interface AskThreadArchived {
  thread_id: string;
  project_id?: string;
}

// ---------------------------------------------------------------------------
// Event registry: event name → required properties (beyond distinct_id)
// ---------------------------------------------------------------------------

interface AnalyticsEventMap {
  // AI Chat
  chat_message_sent: ChatModelInfo;

  // Document editing
  document_improvement_completed: DocumentImprovement;
  improve_writing_initiated: WritingInitiated;
  edit_in_chat_initiated: Record<string, never>;
  text_edit_accepted: Record<string, never>;
  text_edit_rejected: Record<string, never>;

  // Enhancement
  normal_enhance_start: Record<string, never>;
  normal_enhance_done: SessionRef;
  onboarding_enhance_done: SessionRef;
  custom_template_enhancement_started: Record<string, never>;

  // Transcription
  stt_model_changed: SttModelChange;
  cloud_stt_fallback_success: SttFallbackSuccess;
  cloud_stt_fallback_failed: SttFallbackFailed;

  // Templates
  template_selected: Record<string, never>;
  template_created: Record<string, never>;

  // Integrations
  claude_integration_setup_clicked: Record<string, never>;
  claude_integration_disconnect_clicked: Record<string, never>;

  // Settings
  autonomy_selected: Record<string, never>;

  // User engagement
  searched_backlink: Record<string, never>;
  share_option_expanded: Record<string, never>;
  share_triggered: Record<string, never>;
  onboarding_video_started: Record<string, never>;

  // Projects Work OS
  project_created: ProjectCreated;
  project_deleted: ProjectRef;
  project_updated: ProjectRef;
  project_source_status_changed: ProjectSourceStatusChanged;
  project_notes_added: ProjectNotesAdded;
  project_note_removed: ProjectRef;
  project_files_added: ProjectFilesAdded;
  project_file_removed: ProjectFileAction;
  project_file_index_retry: ProjectFileAction;
  project_brief_refresh: ProjectBriefRefresh;
  ask_thread_created: AskThreadCreated;
  ask_message_sent: AskMessageSent;
  ask_answer_generated: AskAnswerGenerated;
  ask_source_opened: AskSourceOpened;
  ask_thread_archived: AskThreadArchived;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AnalyticsEventName = keyof AnalyticsEventMap;

/**
 * Send a typed analytics event. Properties are validated at compile time.
 *
 * @example
 *   trackEvent("chat_message_sent", userId, { model_provider: "OpenRouter", model_name: "anthropic/claude-opus-4.7" });
 *   trackEvent("searched_backlink", userId);
 */
export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  distinctId: string,
  ...args: Record<string, never> extends AnalyticsEventMap[E] ? [properties?: AnalyticsEventMap[E]]
    : [properties: AnalyticsEventMap[E]]
): void {
  const properties = args[0];

  addTelemetryBreadcrumb({
    category: "analytics",
    message: event,
    level: "info",
    data: properties,
  });

  if (!distinctId.trim()) {
    return;
  }

  safeAnalyticsEvent({
    event,
    distinct_id: distinctId,
    ...(properties && Object.keys(properties).length > 0 ? { properties } : {}),
  });
}
