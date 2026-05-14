import type { TiptapEditor } from "@typr/tiptap/editor";
import { tool } from "@typr/utils/ai";
import { z } from "zod";

/**
 * TipTap-inspired tool definitions for AI-powered document editing
 * Simplified for local models (Phi-4, Gemma) and cloud models (GPT, Claude)
 */

export interface DocumentEditingToolsConfig {
  editor: TiptapEditor | null;
  sessionId?: string; // Optional, used for logging
  onProgress?: (status: string, percentage: number) => void;
  onDocumentChange?: (original: string, modified: string, range: { from: number; to: number }) => void;
}

/**
 * Create TipTap-inspired document editing tools
 * These tools follow TipTap's patterns but are simplified for better model compatibility
 */
export function createDocumentEditingTools(config: DocumentEditingToolsConfig) {
  const { editor, onProgress, onDocumentChange } = config;

  // Define each tool as a function that returns the tool definition
  const updateProgressTool = tool({
    description:
      "Update the user on progress of the document editing task. Use this to show what step you are working on.",
    parameters: z.object({
      status: z.string().describe("Current status message (e.g., \"Analyzing document\", \"Generating intro\")"),
      percentage: z.number().min(0).max(100).describe("Progress percentage (0-100)"),
    }),
    execute: async ({ status, percentage }: { status: string; percentage: number }) => {
      console.log(`🔧 [Tool:updateProgress] ${status} - ${percentage}%`);
      onProgress?.(status, percentage);
      return {
        success: true,
        message: `Progress updated: ${status} (${percentage}%)`,
      };
    },
  } as any);

  const readDocumentTool = tool({
    description: "Read the current document content to understand what needs to be edited.",
    parameters: z.object({}),
    execute: async () => {
      if (!editor) {
        return { error: "Editor not available" };
      }

      const text = editor.getText();
      const html = editor.getHTML();

      console.log(`🔧 [Tool:readDocument] Read ${text.length} chars`);

      return {
        success: true,
        text,
        html,
        length: text.length,
      };
    },
  } as any);

  const replaceContentTool = tool({
    description:
      "Replace text content at a specific position in the document. Use this for surgical edits that modify existing content.",
    parameters: z.object({
      startPosition: z.number().describe("Starting position (character index)"),
      endPosition: z.number().describe("Ending position (character index)"),
      newContent: z.string().describe("New content to insert"),
      reasoning: z.string().describe("Brief explanation of why this change is being made"),
    }),
    execute: async (
      { startPosition, endPosition, newContent, reasoning }: {
        startPosition: number;
        endPosition: number;
        newContent: string;
        reasoning: string;
      },
    ) => {
      if (!editor) {
        return { error: "Editor not available" };
      }

      const originalText = editor.getText().slice(startPosition, endPosition);

      console.log(
        `🔧 [Tool:replaceContent] Replacing ${endPosition - startPosition} chars at position ${startPosition}`,
      );

      // Notify parent about the change for diff preview
      onDocumentChange?.(originalText, newContent, { from: startPosition, to: endPosition });

      return {
        success: true,
        originalText,
        newContent,
        range: { from: startPosition, to: endPosition },
        reasoning,
      };
    },
  } as any);

  const insertContentTool = tool({
    description:
      "Insert new content at a specific position without replacing existing content. Use this for adding intros, conclusions, or new sections.",
    parameters: z.object({
      position: z.number().describe("Position to insert at (0 = beginning, end = document length)"),
      newContent: z.string().describe("Content to insert"),
      reasoning: z.string().describe("Brief explanation of what is being added"),
    }),
    execute: async (
      { position, newContent, reasoning }: { position: number; newContent: string; reasoning: string },
    ) => {
      if (!editor) {
        return { error: "Editor not available" };
      }

      console.log(`🔧 [Tool:insertContent] Inserting ${newContent.length} chars at position ${position}`);

      // For insertions, original text is empty
      onDocumentChange?.("", newContent, { from: position, to: position });

      return {
        success: true,
        position,
        newContent,
        reasoning,
      };
    },
  } as any);

  // Return tool definitions directly
  return {
    updateProgress: updateProgressTool,
    readDocument: readDocumentTool,
    replaceContent: replaceContentTool,
    insertContent: insertContentTool,
  };
}

/**
 * Helper to check if model supports tool calling
 */
export function modelSupportsTools(modelId: string): boolean {
  // Cloud models with excellent tool support
  if (modelId.includes("gpt-") || modelId.includes("claude-") || modelId.includes("gemini-")) {
    return true;
  }

  // Groq models
  if (modelId.includes("groq-") || modelId.includes("openai/")) {
    return true;
  }

  // Local models - simplified tool support
  if (modelId.includes("phi-4") || modelId.includes("gemma")) {
    return true; // They can handle simple tools
  }

  return false;
}
