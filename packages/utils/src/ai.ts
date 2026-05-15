import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, extractReasoningMiddleware, type TextStreamPart, type ToolSet, wrapLanguageModel } from "ai";

import { commands as connectorCommands } from "@typr/plugin-connector";
import {
  type AiTaskDefaults,
  type AiTextTask,
  normalizeAiTaskDefaults,
  resolveAiTaskModelId,
} from "./ai-task-defaults";
import { AUTO_CLOUD_MODEL_ID, AUTO_CLOUD_MODEL_PRIORITY, getOsTypeSafe, resolveCloudModelId } from "./cloud-models";
import { fetch as customFetch } from "./fetch";

async function hasConfiguredApiKey(getter: () => Promise<string>): Promise<boolean> {
  try {
    return (await getter()).trim().length > 0;
  } catch {
    return false;
  }
}

async function getConfiguredAutoCloudModelId(): Promise<string> {
  const [hasOpenaiKey, hasGroqKey, hasOpenrouterKey] = await Promise.all([
    hasConfiguredApiKey(connectorCommands.getOpenaiApiKey),
    hasConfiguredApiKey(connectorCommands.getGroqApiKey),
    hasConfiguredApiKey(connectorCommands.getOpenrouterApiKey),
  ]);

  for (const modelId of AUTO_CLOUD_MODEL_PRIORITY) {
    if (modelId.startsWith("openai-") && hasOpenaiKey) {
      return modelId;
    }
    if (modelId.startsWith("groq-") && hasGroqKey) {
      return modelId;
    }
    if (modelId.startsWith("openrouter-") && hasOpenrouterKey) {
      return modelId;
    }
  }

  return "";
}

async function getAiTaskDefaults(): Promise<AiTaskDefaults> {
  try {
    return normalizeAiTaskDefaults(await connectorCommands.getAiTaskDefaults());
  } catch {
    return normalizeAiTaskDefaults(null);
  }
}

async function getStoredCloudModelId(): Promise<string> {
  try {
    return await connectorCommands.getCloudModel();
  } catch {
    return "";
  }
}

async function resolveConfiguredCloudModelId(
  storedCloudModel: string | null | undefined,
  osType?: string | null,
): Promise<string> {
  const normalized = storedCloudModel?.trim() ?? "";
  if (normalized === AUTO_CLOUD_MODEL_ID) {
    return getConfiguredAutoCloudModelId();
  }

  return resolveCloudModelId(storedCloudModel, osType);
}

// Helper to determine template type based on model selection
export const getTemplateType = async (): Promise<string> => {
  const osType = getOsTypeSafe();
  const storedCloudModel = await getStoredCloudModelId();
  const cloudModel = await resolveConfiguredCloudModelId(storedCloudModel, osType);
  return getTemplateTypeForResolvedModel(cloudModel);
};

export const getTemplateTypeForTask = async (task: AiTextTask): Promise<string> => {
  const osType = getOsTypeSafe();
  const defaults = await getAiTaskDefaults();
  const fallbackModelId = await getStoredCloudModelId();
  const configuredModelId = resolveAiTaskModelId({
    task,
    defaults,
    fallbackModelId,
  });
  const cloudModel = await resolveConfiguredCloudModelId(configuredModelId, osType);

  return getTemplateTypeForResolvedModel(cloudModel);
};

async function getTemplateTypeForResolvedModel(cloudModel: string): Promise<string> {
  if (cloudModel && cloudModel.startsWith("openai-")) {
    return "OpenAI";
  }
  if (cloudModel && cloudModel.startsWith("groq-")) {
    return "Groq";
  }
  if (cloudModel && cloudModel.startsWith("openrouter-")) {
    return "OpenRouter";
  }

  const { type } = await connectorCommands.getLlmConnection();
  return type;
}

export { generateObject, generateText, type Provider, smoothStream, streamText, tool } from "ai";

export const localProviderName = "typr-llm-local";
export const remoteProviderName = "typr-llm-remote";
export const openaiProviderName = "typr-openai-cloud";
export const groqProviderName = "typr-groq-cloud";
export const openrouterProviderName = "typr-openrouter-cloud";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";

async function getRequiredApiKey(
  providerName: string,
  getter: () => Promise<string>,
): Promise<string> {
  const apiKey = (await getter()).trim();
  if (!apiKey) {
    throw new Error(`${providerName.toLowerCase()}_api_key_missing`);
  }

  return apiKey;
}

const thinkingMiddleware = extractReasoningMiddleware({
  tagName: "thinking",
  separator: "\n",
  startWithReasoning: false,
});

const thinkMiddleware = extractReasoningMiddleware({
  tagName: "think",
  separator: "\n",
  startWithReasoning: false,
});

const getModel = async ({
  onboarding,
  selectedModel,
  task,
}: {
  onboarding: boolean;
  selectedModel?: string;
  task?: AiTextTask;
}) => {
  // Check for cloud model selection first (unless onboarding)
  if (!onboarding) {
    const osType = getOsTypeSafe();
    const [storedCloudModel, taskDefaults] = await Promise.all([
      getStoredCloudModelId(),
      task ? getAiTaskDefaults() : Promise.resolve(null),
    ]);
    const effectiveSelectedModel = resolveAiTaskModelId({
      task: task ?? "chat",
      defaults: taskDefaults,
      fallbackModelId: storedCloudModel,
      selectedModelId: selectedModel,
    });
    const cloudModel = await resolveConfiguredCloudModelId(effectiveSelectedModel ?? storedCloudModel, osType);

    if (cloudModel && cloudModel.startsWith("openai-")) {
      const modelId = cloudModel.replace("openai-", "");

      const openai = createOpenAI({
        name: openaiProviderName,
        baseURL: OPENAI_API_BASE_URL,
        apiKey: await getRequiredApiKey("openai", connectorCommands.getOpenaiApiKey),
        fetch: customFetch,
      });

      return wrapLanguageModel({
        model: openai(modelId),
        middleware: [thinkingMiddleware, thinkMiddleware],
      });
    } else if (cloudModel && cloudModel.startsWith("groq-")) {
      const modelId = cloudModel.replace("groq-", "");

      const groq = createOpenAI({
        name: groqProviderName,
        baseURL: GROQ_API_BASE_URL,
        apiKey: await getRequiredApiKey("groq", connectorCommands.getGroqApiKey),
        fetch: customFetch,
      });

      return wrapLanguageModel({
        model: groq(modelId),
        middleware: [thinkingMiddleware, thinkMiddleware],
      });
    } else if (cloudModel && cloudModel.startsWith("openrouter-")) {
      const modelId = cloudModel.replace("openrouter-", "");

      const openrouter = createOpenAI({
        name: openrouterProviderName,
        baseURL: OPENROUTER_API_BASE_URL,
        apiKey: await getRequiredApiKey("openrouter", connectorCommands.getOpenrouterApiKey),
        fetch: customFetch,
      });

      return wrapLanguageModel({
        model: openrouter(modelId),
        middleware: [thinkingMiddleware, thinkMiddleware],
      });
    }
  }

  // If a specific OpenAI model is passed as parameter, use it
  if (selectedModel && selectedModel.startsWith("openai-")) {
    const modelId = selectedModel.replace("openai-", "");

    const openai = createOpenAI({
      name: openaiProviderName,
      baseURL: OPENAI_API_BASE_URL,
      apiKey: await getRequiredApiKey("openai", connectorCommands.getOpenaiApiKey),
      fetch: customFetch,
    });

    return wrapLanguageModel({
      model: openai(modelId),
      middleware: [thinkingMiddleware, thinkMiddleware],
    });
  } else if (selectedModel && selectedModel.startsWith("groq-")) {
    const modelId = selectedModel.replace("groq-", "");

    const groq = createOpenAI({
      name: groqProviderName,
      baseURL: GROQ_API_BASE_URL,
      apiKey: await getRequiredApiKey("groq", connectorCommands.getGroqApiKey),
      fetch: customFetch,
    });

    return wrapLanguageModel({
      model: groq(modelId),
      middleware: [thinkingMiddleware, thinkMiddleware],
    });
  } else if (selectedModel && selectedModel.startsWith("openrouter-")) {
    const modelId = selectedModel.replace("openrouter-", "");

    const openrouter = createOpenAI({
      name: openrouterProviderName,
      baseURL: OPENROUTER_API_BASE_URL,
      apiKey: await getRequiredApiKey("openrouter", connectorCommands.getOpenrouterApiKey),
      fetch: customFetch,
    });

    return wrapLanguageModel({
      model: openrouter(modelId),
      middleware: [thinkingMiddleware, thinkMiddleware],
    });
  }

  // Default behavior for local and custom OpenAI-compatible models.
  const getter = onboarding ? connectorCommands.getLocalLlmConnection : connectorCommands.getLlmConnection;
  const { type, connection: { api_base, api_key } } = await getter();

  if (!api_base) {
    console.error("[AI] ERROR: No API base URL provided");
    throw new Error("no_api_base");
  }

  const openai = createOpenAICompatible({
    name: type === "TyprLocal" ? localProviderName : remoteProviderName,
    baseURL: api_base,
    apiKey: api_key ?? "SOMETHING_NON_EMPTY",
    fetch: customFetch,
    // Note: No Origin header needed for Tauri desktop app localhost communication
  });

  const customModel = await connectorCommands.getCustomLlmModel();
  const id = onboarding
    ? "mock-onboarding"
    : (type === "Custom" && customModel)
    ? customModel
    : "gpt-4";

  return wrapLanguageModel({
    model: openai(id),
    middleware: [thinkingMiddleware, thinkMiddleware],
  });
};

type ModelProviderOptions = {
  includeOnboardingModel?: boolean;
  task?: AiTextTask;
};

export const modelProvider = async (
  selectedModel?: string,
  options?: ModelProviderOptions,
) => {
  const includeOnboardingModel = options?.includeOnboardingModel ?? true;
  const defaultModel = await getModel({ onboarding: false, selectedModel, task: options?.task });
  const onboardingModel = includeOnboardingModel
    ? await getModel({ onboarding: true })
    : defaultModel;

  return customProvider({
    languageModels: { defaultModel, onboardingModel },
  });
};

/**
 * Get the current selected model from the UI state
 * This should be called from components that need to know which model to use
 */
export const getSelectedModelForAI = (selectedModel: { id: string; type: string } | null): string | undefined => {
  if (!selectedModel) {
    return undefined;
  }

  // If it's a cloud model, return the full ID for cloud processing.
  if (
    selectedModel.type === "cloud"
    && (
      selectedModel.id.startsWith("openai-")
      || selectedModel.id.startsWith("groq-")
      || selectedModel.id.startsWith("openrouter-")
    )
  ) {
    return selectedModel.id;
  }

  // For local models, return undefined to use default behavior
  return undefined;
};

type TransformState = {
  unprocessedText: string;
  isCurrentlyInCodeBlock: boolean;
};

export const markdownTransform = <TOOLS extends ToolSet>() => (_options: { tools: TOOLS; stopStream: () => void }) => {
  const CODE_FENCE_MARKER = "```";

  const extractAndProcessLines = (
    state: TransformState,
    controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
    processRemainingContent: boolean = false,
  ) => {
    let textToOutput = "";

    while (true) {
      const nextLineBreakPosition = state.unprocessedText.indexOf("\n");
      const hasCompleteLineToProcess = nextLineBreakPosition !== -1;

      if (!hasCompleteLineToProcess) {
        if (!processRemainingContent) {
          break;
        }

        const remainingText = state.unprocessedText;
        if (remainingText.length > 0) {
          state.unprocessedText = "";

          const isCodeFence = remainingText.startsWith(CODE_FENCE_MARKER);
          if (!isCodeFence) {
            textToOutput += remainingText;
          }
        }
        break;
      }

      const currentLineContent = state.unprocessedText.substring(0, nextLineBreakPosition);
      const textAfterCurrentLine = state.unprocessedText.substring(nextLineBreakPosition + 1);

      const isCodeFenceLine = currentLineContent.startsWith(CODE_FENCE_MARKER);

      if (isCodeFenceLine) {
        state.isCurrentlyInCodeBlock = !state.isCurrentlyInCodeBlock;
        state.unprocessedText = textAfterCurrentLine;
        continue;
      }

      const currentLineWithLineBreak = currentLineContent + "\n";
      textToOutput += currentLineWithLineBreak;
      state.unprocessedText = textAfterCurrentLine;
    }

    if (textToOutput.length > 0) {
      controller.enqueue({
        type: "text-delta",
        textDelta: textToOutput,
      } as TextStreamPart<TOOLS>);
    }
  };

  return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
    start(_controller) {
      const state = this as unknown as TransformState;
      state.unprocessedText = "";
      state.isCurrentlyInCodeBlock = false;
    },

    transform(chunk, controller) {
      const state = this as unknown as TransformState;

      const isNonTextChunk = chunk.type !== "text-delta";
      if (isNonTextChunk) {
        extractAndProcessLines(state, controller, true);
        controller.enqueue(chunk);
        return;
      }

      state.unprocessedText += chunk.textDelta;
      extractAndProcessLines(state, controller, false);
    },

    flush(controller) {
      const state = this as unknown as TransformState;
      extractAndProcessLines(state, controller, true);
    },
  });
};
