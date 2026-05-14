import { describe, expect, it } from "vitest";

import {
  getAiTaskDefaultModelId,
  normalizeAiTaskDefaults,
  resolveAiTaskModelId,
} from "./ai-task-defaults";

describe("AI task default model resolution", () => {
  it("falls back to the current chat model when a task default is not set", () => {
    expect(resolveAiTaskModelId({
      task: "projectBrief",
      defaults: {},
      fallbackModelId: "openrouter-openai/gpt-5.5",
    })).toBe("openrouter-openai/gpt-5.5");
  });

  it("uses the task default before the current chat model", () => {
    expect(resolveAiTaskModelId({
      task: "meetingSummary",
      defaults: {
        meeting_summary_model_id: "openrouter-anthropic/claude-haiku-4.5",
      },
      fallbackModelId: "openrouter-openai/gpt-5.5",
    })).toBe("openrouter-anthropic/claude-haiku-4.5");
  });

  it("uses an explicit model before a task default", () => {
    expect(resolveAiTaskModelId({
      task: "projectBrief",
      defaults: {
        project_brief_model_id: "openrouter-anthropic/claude-opus-4.7",
      },
      fallbackModelId: "openrouter-openai/gpt-5.5",
      selectedModelId: "openrouter-google/gemini-3-pro",
    })).toBe("openrouter-google/gemini-3-pro");
  });

  it("keeps chat resolution on the current chat model", () => {
    expect(getAiTaskDefaultModelId({
      project_brief_model_id: "openrouter-anthropic/claude-sonnet-4.6",
      meeting_summary_model_id: "openrouter-anthropic/claude-haiku-4.5",
    }, "chat")).toBe("");
    expect(resolveAiTaskModelId({
      task: "chat",
      defaults: {
        project_brief_model_id: "openrouter-anthropic/claude-sonnet-4.6",
      },
      fallbackModelId: "auto",
    })).toBe("auto");
  });

  it("normalizes empty stored values to null", () => {
    expect(normalizeAiTaskDefaults({
      project_brief_model_id: " ",
      meeting_summary_model_id: "openrouter-anthropic/claude-haiku-4.5",
    })).toEqual({
      project_brief_model_id: null,
      meeting_summary_model_id: "openrouter-anthropic/claude-haiku-4.5",
    });
  });
});
