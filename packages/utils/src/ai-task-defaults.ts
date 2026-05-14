export type AiTextTask = "chat" | "projectBrief" | "meetingSummary";

export type AiTaskDefaults = {
  project_brief_model_id: string | null;
  meeting_summary_model_id: string | null;
};

export type AiTaskDefaultsInput = Partial<AiTaskDefaults> | null | undefined;

export const FOLLOW_CHAT_MODEL_ID = "";

function normalizeModelId(modelId: string | null | undefined): string {
  return modelId?.trim() ?? "";
}

export function getAiTaskDefaultModelId(
  defaults: AiTaskDefaultsInput,
  task: AiTextTask,
): string {
  if (!defaults || task === "chat") {
    return FOLLOW_CHAT_MODEL_ID;
  }

  if (task === "projectBrief") {
    return normalizeModelId(defaults.project_brief_model_id);
  }

  return normalizeModelId(defaults.meeting_summary_model_id);
}

export function resolveAiTaskModelId({
  defaults,
  fallbackModelId,
  selectedModelId,
  task,
}: {
  defaults?: AiTaskDefaultsInput;
  fallbackModelId?: string | null;
  selectedModelId?: string | null;
  task: AiTextTask;
}): string | undefined {
  const selected = normalizeModelId(selectedModelId);
  if (selected) {
    return selected;
  }

  const taskDefault = getAiTaskDefaultModelId(defaults, task);
  if (taskDefault) {
    return taskDefault;
  }

  const fallback = normalizeModelId(fallbackModelId);
  return fallback || undefined;
}

export function normalizeAiTaskDefaults(defaults: AiTaskDefaultsInput): AiTaskDefaults {
  return {
    project_brief_model_id: normalizeModelId(defaults?.project_brief_model_id) || null,
    meeting_summary_model_id: normalizeModelId(defaults?.meeting_summary_model_id) || null,
  };
}
