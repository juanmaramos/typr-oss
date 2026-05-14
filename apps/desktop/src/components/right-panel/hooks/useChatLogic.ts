import { useEffect, useRef, useState } from "react";

import { useChatState } from "@/stores/useChatState";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { showInlineDiffPreview } from "@/utils/inline-diff-preview";
import { useRightPanel } from "@/contexts";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands } from "@typr/plugin-db";
import { commands as localLlmCommands } from "@typr/plugin-local-llm";
import { commands as miscCommands } from "@typr/plugin-misc";
import { commands as templateCommands } from "@typr/plugin-template";
import {
  AUTO_CLOUD_MODEL_ID,
  AUTO_CLOUD_MODEL_PRIORITY,
  CLOUD_GENERATION_TOKEN_BUDGETS,
  containsUrl,
  resolveCloudModelIdForCurrentOs,
  setEnableBrowserSearch,
} from "@typr/utils";
import { generateText, modelProvider, streamText } from "@typr/utils/ai";
import { useSessions } from "@typr/utils/contexts";
import { SHOW_WEB_SEARCH_IN_CHAT_INPUT } from "../constants/features";

import type { ActiveEntityInfo, Message, MessagePart } from "../types/chat-types";

interface UseChatLogicProps {
  sessionId: string | null;
  userId: string | null;
  activeEntity: ActiveEntityInfo | null;
  inputValue: string;
  hasChatStarted: boolean;
  setInputValue: (value: string) => void;
  setHasChatStarted: (started: boolean) => void;
  getChatGroupId: () => Promise<string>;
  sessionData: any;
  chatInputRef: React.RefObject<HTMLTextAreaElement>;
  totalSessionMessages: number;
  editMode?: "chat" | "edit"; // Explicit mode selection
  researchMode?: boolean;
  setResearchMode?: (enabled: boolean) => void;
}

async function hasConfiguredApiKey(getter: () => Promise<string>): Promise<boolean> {
  try {
    return (await getter()).trim().length > 0;
  } catch {
    return false;
  }
}

async function resolveAnalyticsCloudModelId(storedCloudModel: string): Promise<string> {
  if (storedCloudModel !== AUTO_CLOUD_MODEL_ID) {
    return resolveCloudModelIdForCurrentOs(storedCloudModel);
  }

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

interface SubmitOptions {
  bypassDebounce?: boolean;
  source?: string;
}

const logChatSubmit = (event: string, payload?: Record<string, unknown>) => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.log("[floating-chat-submit]", event, payload ?? {});
};

const QWEN_THINKING_CHAT_TOKEN_BUDGET = 32768;

export function useChatLogic({
  sessionId,
  userId,
  activeEntity,
  inputValue,
  hasChatStarted,
  setInputValue,
  setHasChatStarted,
  getChatGroupId,
  sessionData,
  chatInputRef,
  totalSessionMessages,
  editMode = "chat", // Default to chat mode
  researchMode = false,
  setResearchMode,
}: UseChatLogicProps) {
  // Removed noisy log - only log on mode changes, not every render
  // Use Zustand store for messages and isGenerating so they persist across tab switches
  const {
    getMessages,
    setMessages: setMessagesInStore,
    isGenerating: isGeneratingFn,
    setGenerating,
  } = useChatState();

  const messages = sessionId ? getMessages(sessionId) : [];
  const isGenerating = sessionId ? isGeneratingFn(sessionId) : false;

  const sessions = useSessions((state) => state.sessions);
  const {
    surface,
    currentView,
    floatingState,
    openFloating,
  } = useRightPanel();

  // Selection context for editing and Ask mode context
  const { selectedText, selectionRange, sessionId: selectionSessionId, clearSelection } = useSelectionContext();

  // Auto-enable research mode when URL is detected in input (only in Ask mode)
  useEffect(() => {
    if (
      SHOW_WEB_SEARCH_IN_CHAT_INPUT
      && inputValue
      && containsUrl(inputValue)
      && setResearchMode
      && editMode === "chat"
    ) {
      setResearchMode(true);
    }
  }, [inputValue, setResearchMode, editMode]);

  // Disable research mode when switching to Edit mode
  useEffect(() => {
    if (editMode === "edit" && researchMode && setResearchMode) {
      console.log("[useChatLogic] Disabling research mode in Edit mode");
      setResearchMode(false);
    }
  }, [editMode, researchMode, setResearchMode]);

  // AbortController for cancelling in-flight inference
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add debouncing to prevent double submissions
  const lastSubmitTime = useRef(0);
  const SUBMIT_DEBOUNCE_MS = 1000; // 1 second debounce

  const handleApplyMarkdown = async (markdownContent: string) => {
    if (!sessionId) {
      console.error("[AddToNote] No session ID available");
      return;
    }

    const sessionStore = sessions[sessionId];
    if (!sessionStore) {
      console.error("[AddToNote] Session not found in store");
      return;
    }

    // Type definition for sessionStore state to fix TypeScript errors
    type SessionState = {
      showRaw: boolean;
      session: {
        raw_memo_html?: string;
        enhanced_memo_html?: string;
      };
      updateRawNote: (content: string) => void;
      updateEnhancedNote: (content: string) => void;
    };

    try {
      // Convert markdown to HTML (tables will be converted to lists automatically)
      const htmlToInsert = await miscCommands.opinionatedMdToHtml(markdownContent);

      // Ensure global editors registry exists (race condition fix)
      if (!window.__TYPR_EDITORS__) {
        window.__TYPR_EDITORS__ = {};
      }

      // Get editor reference from global registry
      const editorRef = window.__TYPR_EDITORS__[sessionId];
      const editor = editorRef?.editor;
      const storeState = sessionStore.getState() as SessionState;
      const isViewingRaw = storeState.showRaw;

      if (editor && editor.isEditable) {
        // Editor is mounted and ready - insert directly
        console.log("[AddToNote] Editor ready - inserting content directly");
        const { to } = editor.state.selection;

        // Insert at cursor position with paragraph break before content
        editor.commands.insertContentAt(to, "<p></p>" + htmlToInsert);

        // Focus the editor and scroll to the inserted content
        requestAnimationFrame(() => {
          editor.commands.focus();
          editor.commands.setTextSelection(to + 1);
        });

        // The editor's onUpdate callback will handle saving via handleChangeNote
      } else {
        // Editor not mounted yet - update store directly and it will appear when editor mounts
        console.log("[AddToNote] Editor not ready - updating store (content will appear when you view the note)");
        if (isViewingRaw) {
          const currentContent = storeState.session.raw_memo_html || "";
          storeState.updateRawNote(currentContent + htmlToInsert);
        } else {
          const currentContent = storeState.session.enhanced_memo_html || "";
          storeState.updateEnhancedNote(currentContent + htmlToInsert);
        }
      }
    } catch (error) {
      console.error("[AddToNote] Failed to apply markdown content:", error);
    }
  };

  const handleImproveWriting = async (selectedText: string, range: { from: number; to: number }) => {
    if (!sessionId) {
      return;
    }

    // Use dedicated selection handler (same as ⌘L)
    await handleSelectionEdit(
      selectedText,
      range,
      `Improve writing: "${selectedText.slice(0, 50)}${selectedText.length > 50 ? "..." : ""}"`,
      sessionId,
    );
  };

  // Removed: createImproveDocumentTool - using TipTap-based approach instead

  // TipTap-style change detection using editor content (accurate approach)
  // TipTap-inspired surgical change detection
  const findDocumentChanges = (originalHTML: string, newHTML: string, sessionId: string) => {
    const editorRef = window.__TYPR_EDITORS__?.[sessionId];
    const editor = editorRef?.editor;

    if (!editor) {
      console.warn("🎯 [ChangeDetection] No editor available");
      return null;
    }

    // Use HTML comparison for better accuracy
    const currentEditorHTML = editor.getHTML();

    // HTML-based change detection

    // Check if documents are essentially the same (minimal changes)
    if (Math.abs(currentEditorHTML.length - newHTML.length) < 10 && currentEditorHTML.trim() === newHTML.trim()) {
      console.warn("🎯 [ChangeDetection] No significant changes detected");
      return null;
    }

    // Use HTML-based surgical detection
    const changes = findSurgicalChanges(originalHTML, newHTML);

    if (!changes || changes.length === 0) {
      console.warn("🎯 [ChangeDetection] No surgical changes detected");
      return null;
    }

    // For now, apply the first significant change
    const primaryChange = changes[0];

    // HTML change detected

    return {
      originalText: primaryChange.originalText || "",
      improvedText: primaryChange.text || newHTML,
      range: {
        from: primaryChange.position,
        to: primaryChange.position + ("length" in primaryChange ? primaryChange.length : 0),
      },
    };
  };

  // TipTap-inspired change detection algorithm
  const findSurgicalChanges = (originalHTML: string, modifiedHTML: string) => {
    // HTML-based diff algorithm - more reliable than text comparison
    const changes = [];

    // TipTap approach: Use setContent for whole document replacement
    // This is simpler and more reliable than trying to detect partial changes
    // The editor will handle HTML parsing and maintain proper structure

    // HTML replacement strategy for full document edits

    // Replace entire document with new HTML
    // TipTap's setContent handles all the heavy lifting
    // Use -1 as "to" marker to signal full document replacement
    changes.push({
      type: "replace",
      position: 0,
      length: -1, // Special marker for full document
      text: modifiedHTML,
      originalText: originalHTML,
    });

    return changes;
  };

  // Helper: Check if HTML represents an empty document
  const isDocumentEmpty = (html: string): boolean => {
    const trimmed = html.trim();
    if (!trimmed) {
      return true;
    }

    // TipTap empty states: <p></p>, <p><br></p>, or just whitespace
    if (trimmed === "<p></p>" || trimmed === "<p><br></p>") {
      return true;
    }

    // More robust: Check if text content is empty (handles variations)
    const textContent = trimmed.replace(/<[^>]*>/g, "").trim();
    return textContent === "";
  };

  // TipTap-inspired document editing with surgical precision
  const handleTipTapDocumentImprovement = async (userRequest: string, sessionId: string) => {
    try {
      // Get editor reference (TipTap pattern)
      const editorRef = window.__TYPR_EDITORS__?.[sessionId];
      const editor = editorRef?.editor;

      if (!editor) {
        console.error("🎯 [DocumentEdit] No editor available");
        return;
      }

      // CRITICAL: Get clean HTML without diff marks
      // Use editor's text content to reconstruct clean HTML
      // This avoids diff mark corruption issues
      let currentEditorHTML = editor.getHTML();

      // Guard against race condition: if editor HTML is empty but we expect content, refetch from database
      if (currentEditorHTML.trim() === "<p></p>" || currentEditorHTML.trim() === "") {
        console.warn("⚠️ [DocumentEdit] Editor returned empty HTML, checking database...");
        const refetchResult = await sessionData.refetch();

        // CRITICAL: Respect which note the user is currently viewing
        // Get the session store to check showRaw state
        const sessionStore = sessions[sessionId];
        if (!sessionStore) {
          console.error("🐛 [DocumentEdit] Session store not found");
          return;
        }

        const storeState = sessionStore.getState();
        const isViewingRaw = storeState.showRaw;

        // Use the note that matches the current view
        const dbDocument = isViewingRaw
          ? (refetchResult.data?.rawContent || "")
          : (refetchResult.data?.enhancedContent || "");

        console.log(`🔍 [DocumentEdit] User is viewing ${isViewingRaw ? "raw" : "enhanced"} note`);

        if (dbDocument.trim() && dbDocument.trim() !== "<p></p>") {
          console.log(
            `✅ [DocumentEdit] Using ${isViewingRaw ? "raw" : "enhanced"} document from database instead of editor`,
          );
          currentEditorHTML = dbDocument;
        } else {
          console.log("🎯 [DocumentEdit] Document is genuinely empty - will create new content");
        }
      }

      // Check if HTML contains diff marks
      if (currentEditorHTML.includes("data-diff-type")) {
        console.warn("⚠️ [DocumentEdit] Diff marks detected, cleaning document first");

        // Remove diff marks using ProseMirror transaction
        const tr = editor.state.tr;
        const diffMarkType = editor.schema.marks.diffMark;

        if (diffMarkType) {
          // Find and delete all "deleted" nodes
          const rangesToDelete: { from: number; to: number }[] = [];
          editor.state.doc.descendants((node, pos) => {
            if (node.isText && node.marks.some(m => m.type === diffMarkType && m.attrs.type === -1)) {
              rangesToDelete.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          let cleanTr = tr;
          for (let i = rangesToDelete.length - 1; i >= 0; i--) {
            cleanTr = cleanTr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
          }

          // Remove all diff marks
          cleanTr = cleanTr.removeMark(0, cleanTr.doc.content.size, diffMarkType);
          editor.view.dispatch(cleanTr);

          // Get clean HTML after mark removal
          currentEditorHTML = editor.getHTML();
          console.log("✅ [DocumentEdit] Diff marks auto-accepted for new edit");

          // Update previous inline-diff-summary to show "accepted" status (trigger re-render)
          setMessagesInStore(sessionId, (prevMessages) => {
            return prevMessages.map(msg => {
              // Find last pending diff message
              const hasPendingDiff = msg.parts?.some(
                p => p.type === "inline-diff-summary" && p.inlineDiffData?.status === "pending",
              );

              if (hasPendingDiff) {
                // Update status to accepted (creates new object for React)
                return {
                  ...msg,
                  parts: msg.parts?.map(p =>
                    p.type === "inline-diff-summary" && p.inlineDiffData?.status === "pending"
                      ? { ...p, inlineDiffData: { ...p.inlineDiffData, status: "accepted" as const } }
                      : p
                  ),
                };
              }
              return msg;
            });
          });
          console.log("✅ [DocumentEdit] Auto-accepted previous edit");
        }
      }

      // Using HTML context for AI

      // Enhanced templates with HTML for better AI understanding
      // Get lightweight context (title only) for better AI understanding
      const refetchForContext = await sessionData.refetch();
      const sessionTitle = refetchForContext.data?.title || "";

      const [systemMessage, userMessage] = await Promise.all([
        templateCommands.render("document_edit.system", {
          currentDocument: currentEditorHTML,
          sessionTitle: sessionTitle, // Lightweight context for topic awareness
        }),
        templateCommands.render("document_edit.user", {
          userRequest: userRequest,
          currentDocument: currentEditorHTML,
        }),
      ]);

      const [, provider] = await Promise.all([
        connectorCommands.getLlmConnection(),
        modelProvider(undefined, { task: "chat" }),
      ]);

      // Build conversation history with LIMITED context to avoid conflicting instructions
      // APPROACH: Include only last 2 user-assistant exchanges (4 messages) to maintain
      // conversational flow while preventing old instructions from interfering
      const conversationMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemMessage },
      ];

      // 🔍 DIAGNOSTIC: Log conversation history building
      console.log("🔍 [DocumentEdit] Building conversation history");
      console.log("🔍 [DocumentEdit] Total previous messages:", messages.length);

      // STRATEGY: Include last 4 messages max (2 exchanges) for conversational context
      // This allows "make it shorter" or "add examples" follow-ups while preventing
      // old conflicting instructions like "add content" when user says "remove content"
      const MAX_CONTEXT_MESSAGES = 4;
      const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

      console.log(`🔍 [DocumentEdit] Including last ${recentMessages.length} messages (max ${MAX_CONTEXT_MESSAGES})`);

      recentMessages.forEach((msg, index) => {
        console.log(`🔍 [DocumentEdit] Message ${index + 1}:`, {
          role: msg.isUser ? "user" : "assistant",
          content: msg.content.slice(0, 100) + (msg.content.length > 100 ? "..." : ""),
        });
        conversationMessages.push({
          role: msg.isUser ? "user" : "assistant",
          content: msg.content,
        });
      });

      // Add current edit request
      console.log("🔍 [DocumentEdit] Adding current request:", userRequest.slice(0, 100));
      conversationMessages.push({
        role: "user",
        content: userMessage,
      });

      console.log("🔍 [DocumentEdit] Total conversation messages:", conversationMessages.length);

      // Detect request type for optimal temperature
      const isCreativeRequest = /add|create|write|generate|expand|summarize/i.test(userRequest);
      const isFixRequest = /fix|correct|grammar|typo|spelling/i.test(userRequest);

      // Creative tasks need more flexibility, fixes need precision
      const temperature = isCreativeRequest ? 0.4 : isFixRequest ? 0.1 : 0.2;

      // Temperature adjusted based on request type

      // Generate with better prompting for surgical changes
      const { text: newDocument } = await generateText({
        model: provider.languageModel("defaultModel"),
        messages: conversationMessages,
        temperature,
        maxTokens: 8000, // Increased from 4000 - Groq models can handle much more
      });

      // 🔍 LOG RAW AI RESPONSE (BEFORE any checks)
      console.log("🤖 [AI Response] Raw output length:", newDocument?.length || 0);
      console.log("🤖 [AI Response] Content:", newDocument || "(empty)");

      if (!newDocument.trim()) {
        console.warn("🎯 [DocumentEdit] AI returned empty document");
        return;
      }

      // Clean HTML response (remove any markdown code fences the AI might add)
      let cleanDocument = newDocument.trim();

      console.log("🤖 [AI Response] First 500 chars:", newDocument.substring(0, 500));
      console.log("🤖 [AI Response] Last 200 chars:", newDocument.substring(newDocument.length - 200));

      // Check for HTML structure
      const hasH1 = /<h1[^>]*>/i.test(newDocument);
      const hasH2 = /<h2[^>]*>/i.test(newDocument);
      const hasH3 = /<h3[^>]*>/i.test(newDocument);
      const hasP = /<p[^>]*>/i.test(newDocument);
      const hasStrong = /<strong[^>]*>/i.test(newDocument);
      const hasEm = /<em[^>]*>/i.test(newDocument);
      console.log(
        "🔍 [HTML Structure] Has <h1>:",
        hasH1,
        "| <h2>:",
        hasH2,
        "| <h3>:",
        hasH3,
        "| <p>:",
        hasP,
        "| <strong>:",
        hasStrong,
        "| <em>:",
        hasEm,
      );

      // Remove markdown code fences if present
      if (cleanDocument.startsWith("```html") || cleanDocument.startsWith("```")) {
        console.warn("⚠️ [AI Response] Found markdown code fences - cleaning...");
        cleanDocument = cleanDocument.replace(/^```html?\n?/i, "").replace(/\n?```$/, "");
      }

      // Trim whitespace and remove trailing empty paragraphs
      cleanDocument = cleanDocument.trim()
        .replace(/(<p><\/p>\s*)+$/g, "") // Remove trailing empty paragraphs
        .replace(/(<p><br><\/p>\s*)+$/g, "") // Remove trailing line-break paragraphs
        .trim();

      // Check if documents are identical (skip this check for empty documents)
      const wasEmpty = isDocumentEmpty(currentEditorHTML);

      if (!wasEmpty && cleanDocument === currentEditorHTML) {
        console.error("🚨 [DocumentEdit] AI returned IDENTICAL document - no changes made!");
        console.error("🚨 Original request was:", userRequest);
        console.error("🚨 This suggests the AI did not follow instructions");

        // Show error message to user
        const errorMessageId = crypto.randomUUID();
        setMessagesInStore(sessionId, (prev) => [...prev, {
          id: errorMessageId,
          content:
            "⚠️ I apologize - I didn't make any changes to the document. Could you please rephrase your request more specifically? For example, instead of 'make it bold', try 'wrap the word X in <strong> tags' or 'make the heading bold'.",
          isUser: false,
          timestamp: new Date(),
        }]);

        setGenerating(sessionId, false);
        setIsProcessing(false);
        isProcessingRef.current = false;
        return;
      }

      // AI generated HTML document

      // CRITICAL VALIDATION: Detect catastrophic content loss (skip for empty documents)
      if (!wasEmpty) {
        const originalLength = currentEditorHTML.length;
        const newLength = cleanDocument.length;
        const percentageChange = ((newLength - originalLength) / originalLength) * 100;

        // If document shrunk by more than 70% and it's supposed to be an addition, reject it
        if (percentageChange < -70 && isCreativeRequest) {
          console.error(
            "🚨 [DocumentEdit] CATASTROPHIC FAILURE: AI deleted",
            Math.abs(percentageChange).toFixed(1),
            "% of document",
          );
          console.error("🚨 [DocumentEdit] This was a creative request (add/create) but content was removed!");
          console.error("🚨 [DocumentEdit] Rejecting this edit to prevent data loss");

          // Show error message to user via chat
          const errorMessageId = crypto.randomUUID();
          setMessagesInStore(sessionId, (prev) => [...prev, {
            id: errorMessageId,
            content:
              "⚠️ I apologize - I made an error and tried to delete most of your document instead of adding to it. I've prevented this to protect your content. Please try rephrasing your request with more specific details. For example, instead of 'add a summary', try 'add a summary section at the top that covers the main points discussed in the document'.",
            isUser: false,
            timestamp: new Date(),
          }]);
          return;
        }

        // Warn on any significant unexpected shrinkage (but allow it for non-creative tasks)
        if (percentageChange < -50 && !isFixRequest) {
          console.warn(
            "⚠️ [DocumentEdit] Document shrank by",
            Math.abs(percentageChange).toFixed(1),
            "% - this may be unintended",
          );
        }
      }

      // HTML-based surgical change detection
      const changes = findDocumentChanges(currentEditorHTML, cleanDocument, sessionId);
      if (!changes) {
        console.warn("🎯 [DocumentEdit] No surgical changes detected");
        return;
      }

      // Change identified and ready to preview

      // Show inline diff in editor (Cursor-style)
      // The editor's onUpdate callback (handleChangeNote) will automatically save
      // to the correct note (raw or enhanced) based on the current view
      const currentEditor = window.__TYPR_EDITORS__?.[sessionId]?.editor;

      if (currentEditor) {
        showInlineDiffPreview(currentEditor, sessionId, cleanDocument);
      }

      // Detect change type for chat summary
      // Most edits are mixed (add + remove), so default to "modification"
      const lengthDiff = cleanDocument.length - currentEditorHTML.length;
      const changeType: "addition" | "modification" | "removal" = lengthDiff > 100
        ? "addition" // Significant addition
        : lengthDiff < -100
        ? "removal" // Significant removal
        : "modification"; // Mixed or small changes

      // Extract preview text - show what actually changed, not entire document
      const htmlToText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // For additions/modifications, try to extract just the new/changed content
      let preview = "";
      if (changeType === "addition") {
        // Find what was added by comparing lengths
        const oldText = htmlToText(currentEditorHTML);
        const newText = htmlToText(cleanDocument);

        // Simple heuristic: if new is at start, show start; if at end, show end
        if (newText.startsWith(oldText)) {
          // Added at end
          preview = newText.slice(oldText.length).trim().slice(0, 100);
        } else if (newText.endsWith(oldText)) {
          // Added at start
          preview = newText.slice(0, newText.length - oldText.length).trim().slice(0, 100);
        } else {
          // Added in middle or complex change - show first 100 chars of new content
          preview = newText.slice(0, 100);
        }
      } else {
        // For modifications/removals, show first 100 chars
        preview = htmlToText(cleanDocument).slice(0, 100);
      }

      // Create compact summary for chat (not full diff)
      const inlineDiffPart = {
        type: "inline-diff-summary" as const,
        content: "",
        inlineDiffData: {
          changeType,
          characterCount: Math.abs(cleanDocument.length - currentEditorHTML.length),
          preview,
          reasoning: userRequest,
        },
        isComplete: true,
      };

      // 🐛 FIX: Don't add user message here - it was already added in processUserMessage()
      // This was causing duplicate user messages in the chat

      // Add AI response with diff preview
      const aiMessageId = crypto.randomUUID();
      const aiMessage = {
        id: aiMessageId,
        content: "", // No intro text needed - the diff preview is self-explanatory
        isUser: false,
        timestamp: new Date(),
        parts: [inlineDiffPart],
      };

      console.log("🔍 [DocumentEdit] Adding AI response (no duplicate user message)");
      setMessagesInStore(sessionId, (prev) => [...prev, aiMessage]);

      // CRITICAL: Save AI message to database for persistence
      // User message was already saved in processUserMessage()
      const chatGroupId = await getChatGroupId();
      await dbCommands.upsertChatMessage({
        id: aiMessageId,
        group_id: chatGroupId,
        created_at: aiMessage.timestamp.toISOString(),
        content: aiMessage.content,
        role: "Assistant",
        parts: JSON.stringify(aiMessage.parts), // Save diff preview data
      });

      // Messages saved to database

      // Track analytics
      if (userId) {
        safeAnalyticsEvent({
          event: "document_improvement_completed",
          distinct_id: userId,
          properties: {
            original_length: currentEditorHTML.length,
            improved_length: cleanDocument.length,
            method: "tiptap_html_style",
            session_id: sessionId,
          },
        });
      }

      // Diff preview created

      // Clear generating state
      setGenerating(sessionId, false);
      setIsProcessing(false);
      isProcessingRef.current = false;
    } catch (error) {
      console.error("🎯 [DocumentEdit] Failed to improve document:", error);

      // CRITICAL: Clear generating state on error too
      setGenerating(sessionId, false);
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  /**
   * Handle selection-based edits (⌘L and "Improve writing" button)
   * Clean, focused handler for editing only selected text
   */
  const handleSelectionEdit = async (
    selectedText: string,
    range: { from: number; to: number },
    userRequest: string,
    sessionId: string,
  ) => {
    console.log("🎯 [SelectionEdit] Starting edit - selection will persist until Accept/Reject");
    console.log("🎯 [SelectionEdit] Selection:", { textLength: selectedText.length, range });

    // Clear input only - keep selection visible until Accept/Reject
    setInputValue("");
    // NOTE: Selection is intentionally kept visible during editing
    // It will be cleared when user clicks Accept/Reject in message-wrapper.tsx

    // Detect simple formatting requests
    const isFormattingRequest = /\b(make|format|apply)\b.*\b(bold|italic|underline|heading|h1|h2|h3)\b/i.test(
      userRequest,
    );

    if (isFormattingRequest) {
      // Provide helpful guidance instead of attempting AI formatting
      const formattingGuideMsg = {
        id: crypto.randomUUID(),
        content: userRequest,
        isUser: true,
        timestamp: new Date(),
      };

      const guideResponseMsg = {
        id: crypto.randomUUID(),
        content: `For formatting, please use these quick shortcuts:

• Bold: Select text and press ⌘B
• Italic: Select text and press ⌘I
• Heading: Add a # symbol and a space in front of the text

I'm better at helping with content improvements like:
• "Improve the writing in this paragraph"
• "Make this more concise"
• "Fix grammar and spelling"
• "Rewrite in a professional tone"

Would you like me to help improve the content instead?`,
        isUser: false,
        timestamp: new Date(),
      };

      setMessagesInStore(sessionId, (prev) => [...prev, formattingGuideMsg, guideResponseMsg]);

      // Save to DB
      const chatGroupId = await getChatGroupId();
      await Promise.all([
        dbCommands.upsertChatMessage({
          id: formattingGuideMsg.id,
          group_id: chatGroupId,
          created_at: formattingGuideMsg.timestamp.toISOString(),
          content: formattingGuideMsg.content,
          role: "User",
          parts: null,
        }),
        dbCommands.upsertChatMessage({
          id: guideResponseMsg.id,
          group_id: chatGroupId,
          created_at: guideResponseMsg.timestamp.toISOString(),
          content: guideResponseMsg.content,
          role: "Assistant",
          parts: null,
        }),
      ]);

      return;
    }

    // Add clean user message
    const userMsg = {
      id: crypto.randomUUID(),
      content: userRequest, // Clean: "add emojis" (no IMPORTANT text)
      isUser: true,
      timestamp: new Date(),
    };
    setMessagesInStore(sessionId, (prev) => [...prev, userMsg]);

    // Set generating state and wait for render (shows loading indicator)
    setGenerating(sessionId, true);
    await new Promise(resolve => requestAnimationFrame(resolve));

    try {
      // Get editor
      const editor = window.__TYPR_EDITORS__?.[sessionId]?.editor;
      if (!editor) {
        throw new Error("No editor");
      }

      // Auto-clean any pending diff marks (same as document edits)
      let currentHTML = editor.getHTML();
      if (currentHTML.includes("data-diff-type")) {
        console.warn("⚠️ [SelectionEdit] Auto-accepting previous edit");

        const tr = editor.state.tr;
        const diffMarkType = editor.schema.marks.diffMark;

        if (diffMarkType) {
          // Delete red strikethrough nodes
          const rangesToDelete: { from: number; to: number }[] = [];
          editor.state.doc.descendants((node, pos) => {
            if (
              node.isText
              && node.marks.some(m => m.type === diffMarkType && (m.attrs.type === -1 || m.attrs.type === "-1"))
            ) {
              rangesToDelete.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          let cleanTr = tr;
          for (let i = rangesToDelete.length - 1; i >= 0; i--) {
            cleanTr = cleanTr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
          }

          cleanTr = cleanTr.removeMark(0, cleanTr.doc.content.size, diffMarkType);
          editor.view.dispatch(cleanTr);
          currentHTML = editor.getHTML();

          // Update previous message status (trigger React re-render)
          setMessagesInStore(sessionId, (prevMessages) => {
            return prevMessages.map(msg => {
              const hasPendingDiff = msg.parts?.some(
                p => p.type === "inline-diff-summary" && p.inlineDiffData?.status === "pending",
              );

              if (hasPendingDiff) {
                return {
                  ...msg,
                  parts: msg.parts?.map(p =>
                    p.type === "inline-diff-summary" && p.inlineDiffData?.status === "pending"
                      ? { ...p, inlineDiffData: { ...p.inlineDiffData, status: "accepted" as const } }
                      : p
                  ),
                };
              }
              return msg;
            });
          });
        }
      }

      // Build prompt with selection context - FOCUS FIRST (critical for AI attention)
      const targetedPrompt =
        `⚠️ CRITICAL: Edit ONLY the selected text below. Do NOT modify anything outside this selection.

Selected text to edit: "${selectedText}"

Your task: ${userRequest}

Leave everything else in the document completely unchanged.`;

      // Use same templates as document edits
      const [systemMessage, userMessage] = await Promise.all([
        templateCommands.render("document_edit.system", { currentDocument: currentHTML }),
        templateCommands.render("document_edit.user", {
          userRequest: targetedPrompt,
          currentDocument: currentHTML,
        }),
      ]);

      const provider = await modelProvider(undefined, { task: "chat" });

      // Build conversation history with ALL messages for full context
      const conversationMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemMessage },
      ];

      // Add ALL chat messages for full context
      messages.forEach(msg => {
        conversationMessages.push({
          role: msg.isUser ? "user" : "assistant",
          content: msg.content,
        });
      });

      // Add current request
      conversationMessages.push({
        role: "user",
        content: userMessage,
      });

      const isCreativeRequest = /add|create|write|generate|expand|rewrite/i.test(userRequest);
      const temperature = isCreativeRequest ? 0.3 : 0.1;

      const { text: newDocument } = await generateText({
        model: provider.languageModel("defaultModel"),
        messages: conversationMessages,
        temperature,
        maxTokens: 8000,
      });

      // Clean and validate AI response
      let cleanDoc = newDocument.trim()
        .replace(/^```html?\n?/i, "") // Remove code fences if present
        .replace(/\n?```$/, "")
        .trim()
        .replace(/(<p><\/p>\s*)+$/g, "") // Remove trailing empty paragraphs
        .replace(/(<p><br><\/p>\s*)+$/g, "") // Remove trailing line-break paragraphs
        .trim();

      console.log("🤖 [SelectionEdit] AI Response length:", newDocument?.length || 0);
      console.log("🤖 [SelectionEdit] First 300 chars:", newDocument.substring(0, 300));

      // Check for formatting tags
      const hasStrong = /<strong[^>]*>/i.test(cleanDoc);
      const hasEm = /<em[^>]*>/i.test(cleanDoc);
      const hasH1 = /<h1[^>]*>/i.test(cleanDoc);
      console.log("🔍 [SelectionEdit] Has <strong>:", hasStrong, "| <em>:", hasEm, "| <h1>:", hasH1);

      // Check if AI returned identical HTML (no changes made)
      if (cleanDoc === currentHTML) {
        console.error("🚨 [SelectionEdit] AI returned IDENTICAL document - no changes made!");
        console.error("🚨 User request:", userRequest);
        console.error("🚨 Selected text:", selectedText.slice(0, 100));

        // Show error message
        const errorMsg = {
          id: crypto.randomUUID(),
          content:
            "⚠️ I didn't make any changes to your selection. Please try being more specific. For example: 'wrap \"key phrase\" in <strong> tags' or 'make the first sentence bold'.",
          isUser: false,
          timestamp: new Date(),
        };
        setMessagesInStore(sessionId, (prev) => [...prev, errorMsg]);
        setGenerating(sessionId, false);
        return;
      }

      showInlineDiffPreview(editor, sessionId, cleanDoc);

      // Create compact summary with CLEAN display
      const aiMsg = {
        id: crypto.randomUUID(),
        content: "",
        isUser: false,
        timestamp: new Date(),
        parts: [{
          type: "inline-diff-summary" as const,
          content: "",
          inlineDiffData: {
            changeType: "modification" as const,
            characterCount: Math.abs(cleanDoc.length - currentHTML.length),
            preview: selectedText.slice(0, 100), // Show selected text
            reasoning: userRequest, // Clean: "add emojis"
            status: "pending" as const,
          },
          isComplete: true,
        }],
      };

      setMessagesInStore(sessionId, (prev) => [...prev, aiMsg]);

      // Save to DB
      const chatGroupId = await getChatGroupId();
      await Promise.all([
        dbCommands.upsertChatMessage({
          id: userMsg.id,
          group_id: chatGroupId,
          created_at: userMsg.timestamp.toISOString(),
          content: userMsg.content,
          role: "User",
          parts: null,
        }),
        dbCommands.upsertChatMessage({
          id: aiMsg.id,
          group_id: chatGroupId,
          created_at: aiMsg.timestamp.toISOString(),
          content: "",
          role: "Assistant",
          parts: JSON.stringify(aiMsg.parts),
        }),
      ]);

      setGenerating(sessionId, false);
    } catch (error) {
      console.error("[SelectionEdit] Failed:", error);
      setGenerating(sessionId, false);
    }
  };

  const prepareMessageHistory = async (messages: Message[], currentUserMessage?: string) => {
    // Force fresh session data to avoid stale context
    const refetchResult = await sessionData.refetch();
    let freshSessionData = refetchResult.data;

    if (!freshSessionData) {
      throw new Error("Failed to load session data");
    }

    const { type } = await connectorCommands.getLlmConnection();

    const participants = sessionId ? await dbCommands.sessionListParticipants(sessionId) : [];

    const calendarEvent = sessionId ? await dbCommands.sessionGetEvent(sessionId) : null;

    // Get current user profile for AI context
    const currentUser = userId ? await dbCommands.getHuman(userId) : null;

    // OPTIMIZATION: Remove currentDateTime to enable prompt caching
    // The AI doesn't need real-time date awareness for chat about transcripts
    // Event dates are already in the event info if needed

    const eventInfo = calendarEvent
      ? `${calendarEvent.name} (${calendarEvent.start_date} - ${calendarEvent.end_date})${
        calendarEvent.note ? ` - ${calendarEvent.note}` : ""
      }`
      : "";

    const enableResearch = researchMode;

    const systemContent = await templateCommands.render("ai_chat.system", {
      session: freshSessionData,
      words: JSON.stringify(freshSessionData?.words || []),
      title: freshSessionData?.title,
      enhancedContent: freshSessionData?.enhancedContent,
      rawContent: freshSessionData?.rawContent,
      preMeetingContent: freshSessionData?.preMeetingContent,
      type: type,
      date: null, // Removed to enable Groq prompt caching - saves 50% on cached tokens
      participants: participants,
      event: eventInfo,
      userFullName: currentUser?.full_name,
      supportsTools: enableResearch, // Enable tool instructions for research mode
    });

    // Clean approach - use existing chat system for Ask mode, dedicated templates for Edit mode
    const enhancedSystemContent = systemContent; // Template handles tool support conditionally

    // System content is ready

    const conversationHistory: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      { role: "system" as const, content: enhancedSystemContent },
    ];

    messages.forEach(message => {
      conversationHistory.push({
        role: message.isUser ? ("user" as const) : ("assistant" as const),
        content: message.content,
      });
    });

    if (currentUserMessage) {
      conversationHistory.push({
        role: "user" as const,
        content: currentUserMessage,
      });
    }

    return conversationHistory;
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const isProcessingRef = useRef(false);

  const beginSubmission = (content: string, analyticsEvent: string, source: string, bypassDebounce = false) => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      logChatSubmit("submit_blocked_empty", {
        source,
        sessionId,
        analyticsEvent,
      });
      return {
        accepted: false,
        capturedSessionId: null,
        trimmedContent,
      };
    }

    if (isProcessing || isGenerating || isProcessingRef.current) {
      logChatSubmit("submit_blocked_busy", {
        source,
        sessionId,
        isGenerating,
        isProcessing,
        isProcessingRef: isProcessingRef.current,
      });
      return {
        accepted: false,
        capturedSessionId: null,
        trimmedContent,
      };
    }

    if (!sessionId) {
      logChatSubmit("submit_blocked_no_session", {
        source,
      });
      return {
        accepted: false,
        capturedSessionId: null,
        trimmedContent,
      };
    }

    if (!bypassDebounce) {
      const now = Date.now();
      if (now - lastSubmitTime.current < SUBMIT_DEBOUNCE_MS) {
        logChatSubmit("submit_blocked_debounce", {
          source,
          sessionId,
          elapsedMs: now - lastSubmitTime.current,
        });
        return {
          accepted: false,
          capturedSessionId: null,
          trimmedContent,
        };
      }
      lastSubmitTime.current = now;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);
    setGenerating(sessionId, true);
    if (surface === "floating") {
      logChatSubmit("expand_floating_on_submit", {
        source,
        sessionId,
        currentView,
        floatingState,
      });
      openFloating("chat", { focus: false });
    }

    logChatSubmit("submit_accepted", {
      source,
      sessionId,
      analyticsEvent,
      contentLength: trimmedContent.length,
      bypassDebounce,
    });

    return {
      accepted: true,
      capturedSessionId: sessionId,
      trimmedContent,
    };
  };

  const processUserMessage = async (
    capturedSessionId: string,
    content: string,
    analyticsEvent: string,
  ): Promise<boolean> => {
    if (!content.trim()) {
      logChatSubmit("process_blocked_empty", {
        sessionId: capturedSessionId,
        analyticsEvent,
      });
      return false;
    }

    logChatSubmit("process_start", {
      capturedSessionId,
      analyticsEvent,
      contentLength: content.trim().length,
      editMode,
      isGenerating,
      isProcessing,
      isProcessingRef: isProcessingRef.current,
      totalSessionMessages,
    });

    console.log("[processUserMessage] Starting with captured sessionId:", capturedSessionId);
    console.log("[processUserMessage] Selection context check:", {
      selectedText: selectedText ? `"${selectedText.slice(0, 50)}..."` : null,
      selectionRange,
      selectionSessionId,
      capturedSessionId,
      hasSelection: !!(selectedText && selectionRange && selectionSessionId === capturedSessionId),
      editMode, // Log current mode for debugging
    });

    // Mode-aware selection handling:
    // - Edit mode: Selection triggers editing (use handleSelectionEdit)
    // - Ask mode: Selection is just context (treat as regular chat with context)
    if (selectedText && selectionRange && selectionSessionId === capturedSessionId) {
      if (editMode === "edit") {
        // Edit mode: Handle as selection edit
        console.log("🎯 [SelectionEdit] Edit mode - applying changes to selection");
        await handleSelectionEdit(selectedText, selectionRange, content, capturedSessionId);
        return true;
      } else {
        // Ask mode: Include selection as context, but don't edit
        console.log("🎯 [SelectionContext] Ask mode - selection will be included as context for conversation");
        // Continue with normal chat flow below, selection will be included in message history
      }
    }

    if (userId) {
      // Get current model for analytics tracking - check cloud models first
      try {
        const cloudModel = await resolveAnalyticsCloudModelId(await connectorCommands.getCloudModel());

        let modelProvider: string;
        let modelName: string;

        if (cloudModel && cloudModel.startsWith("openai-")) {
          modelProvider = "OpenAI";
          modelName = cloudModel.replace("openai-", "");
          console.log(`[ANALYTICS] 📊 Cloud model detected: ${modelName} (${modelProvider})`);
        } else if (cloudModel && cloudModel.startsWith("groq-")) {
          modelProvider = "Groq";
          modelName = cloudModel.replace("groq-", "");
          console.log(`[ANALYTICS] 📊 Cloud model detected: ${modelName} (${modelProvider})`);
        } else if (cloudModel && cloudModel.startsWith("openrouter-")) {
          modelProvider = "OpenRouter";
          modelName = cloudModel.replace("openrouter-", "");
          console.log(`[ANALYTICS] 📊 Cloud model detected: ${modelName} (${modelProvider})`);
        } else {
          const currentModel = await localLlmCommands.getCurrentModel();
          const connection = await connectorCommands.getLlmConnection();
          modelProvider = connection.type;
          modelName = currentModel || "unknown";
          console.log(`[ANALYTICS] 📊 Local model detected: ${modelName} (${modelProvider})`);
        }

        // Make analytics non-blocking with timeout to prevent hanging
        safeAnalyticsEvent({
          event: analyticsEvent,
          distinct_id: userId,
          properties: {
            model_provider: modelProvider,
            model_name: modelName,
          },
        });
      } catch (error) {
        // Fallback analytics without model info if there's an error
        safeAnalyticsEvent({
          event: analyticsEvent,
          distinct_id: userId,
        });
      }
    }

    if (!hasChatStarted && activeEntity) {
      setHasChatStarted(true);
    }

    const groupId = await getChatGroupId();
    console.log("[processUserMessage] Using chat group", { groupId, sessionId: capturedSessionId });
    logChatSubmit("group_ready", {
      capturedSessionId,
      groupId,
    });

    // In Ask mode with selection, include selection as context in the user message
    let messageContent = content;
    if (editMode === "chat" && selectedText && selectionRange && selectionSessionId === capturedSessionId) {
      // Ask mode: Include selection as context for the question
      // For long selections, use a truncated preview to keep chat history clean
      const TRUNCATE_THRESHOLD = 200;
      const selectionPreview = selectedText.length > TRUNCATE_THRESHOLD
        ? `${selectedText.slice(0, TRUNCATE_THRESHOLD)}... [${selectedText.length} characters]`
        : selectedText;

      messageContent = `Regarding this text:\n\n"${selectionPreview}"\n\n${content}`;
      console.log("🎯 [AskMode] Including selection as context in message");

      // Clear selection and editor highlight after including it in message
      clearSelection();

      // Also clear the AI selection highlight from editor
      const editorRef = window.__TYPR_EDITORS__?.[capturedSessionId];
      if (editorRef?.editor) {
        editorRef.editor.commands.unsetAISelection();
        console.log("🎯 [AskMode] Cleared AI selection highlight from editor");
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: messageContent,
      isUser: true,
      timestamp: new Date(),
    };

    // Use captured sessionId to ensure message goes to correct session
    setMessagesInStore(capturedSessionId, (prev) => [...prev, userMessage]);
    setInputValue("");

    await dbCommands.upsertChatMessage({
      id: userMessage.id,
      group_id: groupId,
      created_at: userMessage.timestamp.toISOString(),
      role: "User",
      content: userMessage.content.trim(),
      parts: userMessage.parts ? JSON.stringify(userMessage.parts) : null,
    });

    // Check for Edit mode document editing BEFORE try block
    const refetchForDoc = await sessionData.refetch();
    const currentDocument = refetchForDoc.data?.enhancedContent || refetchForDoc.data?.rawContent || "";

    console.log("🎯 [ProcessMessage] Mode check:", {
      editMode,
      hasDocument: !!currentDocument.trim(),
      content: content.slice(0, 50),
    });

    if (editMode === "edit") {
      console.log("🎯 [DocumentEdit] Edit mode detected - using dedicated templates");

      if (!currentDocument.trim()) {
        console.log("🎯 [DocumentEdit] Empty document - AI will create new content from scratch");
      }

      await handleTipTapDocumentImprovement(content, capturedSessionId);
      console.log("🎯 [DocumentEdit] Dedicated template processing completed");

      // Clean up state after successful edit
      setGenerating(capturedSessionId, false);
      setIsProcessing(false);
      isProcessingRef.current = false;
      return true; // Exit early for document editing
    }

    try {
      // Ensure LLM connection is ready (reduced invalidation)
      const llmConnection = await connectorCommands.getLlmConnection();
      const startsWithReasoning = llmConnection.type === "TyprLocal"
        && (await localLlmCommands.getCurrentModel().catch(() => null)) === "Qwen3_4bThinkingQ4Km";
      // Qwen3-4B-Thinking-2507 is thinking-only and its model card recommends
      // 32,768 output tokens for typical queries. The default chat budget can
      // finish before the implicit <think> block closes, leaving no answer text.
      const maxChatTokens = startsWithReasoning
        ? QWEN_THINKING_CHAT_TOKEN_BUDGET
        : CLOUD_GENERATION_TOKEN_BUDGETS.chatAnswer;

      const provider = await modelProvider(undefined, { task: "chat" });
      const model = provider.languageModel("defaultModel");

      const aiMessageId = crypto.randomUUID();
      // Do not add a message with "Generating..." content, we'll use the typing indicator instead
      // and only show actual content when it starts streaming

      const messageHistory = await prepareMessageHistory(messages, content);

      // Track browser search sources for citation linking
      const searchSources: Array<{ url: string; title?: string }> = [];

      // Extract URL from user's message for citation source linking
      const { extractUrls } = await import("@typr/utils");
      const userUrls = extractUrls(content);
      if (userUrls.length > 0) {
        console.log("[processUserMessage] 🔗 Detected URLs in user message:", userUrls);
        // Add user-provided URLs as fallback sources
        searchSources.push(...userUrls.map(url => ({ url })));
      }

      // Ask mode - no tools, just conversation (unless research mode is active)
      // Edit mode already handled above with dedicated templates
      const isResearchMode = researchMode;
      console.log("[processUserMessage] Starting stream with model:", model);
      console.log("[processUserMessage] Message history length:", messageHistory.length);
      logChatSubmit("stream_start", {
        capturedSessionId,
        groupId,
        messageHistoryLength: messageHistory.length,
        isResearchMode,
      });
      console.log(
        "[processUserMessage] Ask mode - streaming response",
        isResearchMode ? "WITH browser_search tool" : "without tools",
      );

      // Enable browser search header for this request
      const shouldEnableSearch = isResearchMode || false;
      console.log("[processUserMessage] 🌐 Setting browser search header:", shouldEnableSearch);
      setEnableBrowserSearch(shouldEnableSearch);

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const { fullStream } = streamText({
        model,
        messages: messageHistory,
        tools: {}, // Explicitly no tools to prevent hallucination
        maxSteps: 1,
        maxTokens: maxChatTokens,
        maxRetries: 3,
        abortSignal: abortController.signal,
        onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
          console.log("🔧 [AI SDK] Step finished:", {
            hasText: !!text,
            toolCallCount: toolCalls?.length || 0,
            toolResultCount: toolResults?.length || 0,
            finishReason,
          });

          // TipTap-inspired tool result handling
          if (toolResults && toolResults.length > 0) {
            for (const toolResult of toolResults) {
              const result = (toolResult as any).result;
              const toolName = (toolResult as any).toolName;

              console.log(`🔧 [Tool:${toolName}] Processing result:`, result);

              // Extract sources from browser_search tool results
              if (toolName === "browser_search" && result) {
                // Try to extract URL from tool result
                let sourceUrl: string | null = null;
                let sourceTitle: string | null = null;

                // Check various possible result structures
                if (typeof result === "string") {
                  // Result is plain text, try to extract URL from it
                  const urlMatch = result.match(/https?:\/\/[^\s]+/);
                  if (urlMatch) {
                    sourceUrl = urlMatch[0];
                  }
                } else if (result && typeof result === "object") {
                  // Result is an object, check for url/title fields
                  sourceUrl = (result as any).url || (result as any).link || (result as any).source;
                  sourceTitle = (result as any).title || (result as any).name;
                }

                if (sourceUrl) {
                  searchSources.push({
                    url: sourceUrl,
                    title: sourceTitle || undefined,
                  });
                  console.log(`🔗 [browser_search] Captured source:`, sourceUrl);
                }
                continue;
              }

              // Handle updateProgress tool
              if (toolName === "updateProgress" && result?.status) {
                console.log(`📊 Progress: ${result.status} (${result.percentage || 0}%)`);
                // Could update UI progress indicator here
                continue;
              }

              // Handle replaceContent tool - create diff preview
              if (toolName === "replaceContent" && result?.originalText && result?.newContent && result?.range) {
                const diffMessageId = crypto.randomUUID();
                const diffMessage = {
                  id: diffMessageId,
                  content: "", // No intro text - diff preview speaks for itself
                  isUser: false,
                  timestamp: new Date(),
                  parts: [{
                    type: "diff-preview" as const,
                    content: "",
                    diffData: {
                      original: result.originalText,
                      edited: result.newContent,
                      reasoning: result.reasoning || "AI edit completed",
                      range: result.range,
                    },
                    isComplete: true,
                  }],
                };

                setMessagesInStore(capturedSessionId, (prev) => [...prev, diffMessage]);

                if (userId) {
                  safeAnalyticsEvent({
                    event: "document_improvement_completed",
                    distinct_id: userId,
                    properties: {
                      original_length: result.originalText.length,
                      improved_length: result.newContent.length,
                      method: "tool_based_edit",
                      session_id: capturedSessionId,
                    },
                  });
                }
                continue;
              }

              // Handle insertContent tool - create diff preview
              if (toolName === "insertContent" && result?.newContent && result?.position !== undefined) {
                const diffMessageId = crypto.randomUUID();
                const diffMessage = {
                  id: diffMessageId,
                  content: "Here's the new content:",
                  isUser: false,
                  timestamp: new Date(),
                  parts: [{
                    type: "diff-preview" as const,
                    content: "",
                    diffData: {
                      original: "",
                      edited: result.newContent,
                      reasoning: result.reasoning || "Content inserted",
                      range: { from: result.position, to: result.position },
                    },
                    isComplete: true,
                  }],
                };

                setMessagesInStore(capturedSessionId, (prev) => [...prev, diffMessage]);
                continue;
              }
            }
          }
        },
        onError: (error) => {
          // Handle tool-related errors cleanly
          if (String(error).includes("NoSuchToolError")) {
            console.warn("[processUserMessage] Model tried to use unavailable tool - continuing with regular response");
            return;
          }

          console.error("[processUserMessage] Stream error:", error);
        },
      });

      let aiResponse = "";
      let reasoningResponse = "";
      let chunkCount = 0;
      let textChunkCount = 0;
      let reasoningChunkCount = 0;
      const closingThinkTag = "</think>";
      let isInPromptStartedReasoning = startsWithReasoning;
      let promptStartedReasoningBuffer = "";

      // Qwen Thinking GGUF starts the assistant prompt inside <think>, so generation may
      // only emit the closing tag. Keep that pre-answer text out of the visible answer.
      const splitPromptStartedReasoning = (textDelta: string) => {
        if (!isInPromptStartedReasoning) {
          return { reasoningDelta: "", answerDelta: textDelta };
        }

        promptStartedReasoningBuffer += textDelta;
        const closingTagIndex = promptStartedReasoningBuffer.indexOf(closingThinkTag);

        if (closingTagIndex !== -1) {
          const reasoningDelta = promptStartedReasoningBuffer.slice(0, closingTagIndex);
          const answerDelta = promptStartedReasoningBuffer
            .slice(closingTagIndex + closingThinkTag.length)
            .replace(/^\s+/, "");

          promptStartedReasoningBuffer = "";
          isInPromptStartedReasoning = false;

          return { reasoningDelta, answerDelta };
        }

        const retainedLength = closingThinkTag.length - 1;
        const publishLength = Math.max(0, promptStartedReasoningBuffer.length - retainedLength);
        const reasoningDelta = promptStartedReasoningBuffer.slice(0, publishLength);
        promptStartedReasoningBuffer = promptStartedReasoningBuffer.slice(publishLength);

        return { reasoningDelta, answerDelta: "" };
      };

      const buildReasoningParts = (isComplete: boolean, forcePending = false): MessagePart[] | undefined => {
        if (!reasoningResponse.trim() && !(forcePending && !isComplete)) {
          return undefined;
        }

        return [{
          type: "reasoning",
          content: reasoningResponse,
          isComplete,
        }];
      };

      const upsertAssistantMessage = (reasoningComplete: boolean) => {
        const reasoningParts = buildReasoningParts(reasoningComplete, !aiResponse.trim());
        const sources = searchSources.length > 0 ? searchSources : undefined;

        setMessagesInStore(capturedSessionId, (prev) => {
          const existingMessage = prev.find(msg => msg.id === aiMessageId);

          if (!existingMessage) {
            return [...prev, {
              id: aiMessageId,
              content: aiResponse,
              isUser: false,
              timestamp: new Date(),
              sources,
              parts: reasoningParts,
            }];
          }

          return prev.map(msg =>
            msg.id === aiMessageId
              ? {
                ...msg,
                content: aiResponse,
                sources,
                parts: reasoningParts,
              }
              : msg
          );
        });
      };

      // RAF throttling for smooth 60fps updates (prevents Windows blinking)
      let rafId: number | null = null;
      let pendingUpdate = false;

      const scheduleUpdate = () => {
        if (pendingUpdate) {
          return;
        }
        pendingUpdate = true;

        rafId = requestAnimationFrame(() => {
          upsertAssistantMessage(false);
          pendingUpdate = false;
        });
      };

      if (startsWithReasoning) {
        upsertAssistantMessage(false);
      }

      for await (const chunk of fullStream) {
        if (chunk.type !== "text-delta" && chunk.type !== "reasoning") {
          continue;
        }

        chunkCount++;
        if (chunk.type === "text-delta") {
          textChunkCount++;
        } else {
          reasoningChunkCount++;
        }

        if (chunkCount === 1) {
          console.log("[processUserMessage] First chunk received");
          logChatSubmit("stream_first_chunk", {
            capturedSessionId,
            groupId,
          });
        }

        if (chunk.type === "text-delta") {
          const { reasoningDelta, answerDelta } = splitPromptStartedReasoning(chunk.textDelta);
          reasoningResponse += reasoningDelta;
          aiResponse += answerDelta;
        } else {
          if (promptStartedReasoningBuffer) {
            reasoningResponse += promptStartedReasoningBuffer;
            promptStartedReasoningBuffer = "";
          }
          isInPromptStartedReasoning = false;
          reasoningResponse += chunk.textDelta;
        }

        // Schedule throttled update (max 60fps instead of 200+fps)
        scheduleUpdate();
      }

      if (promptStartedReasoningBuffer) {
        reasoningResponse += promptStartedReasoningBuffer;
        promptStartedReasoningBuffer = "";
      }

      // Ensure final update happens immediately after stream completes
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      console.log(
        "[processUserMessage] Stream completed. Total chunks:",
        chunkCount,
        "Text chunks:",
        textChunkCount,
        "Reasoning chunks:",
        reasoningChunkCount,
        "Response length:",
        aiResponse.length,
      );
      logChatSubmit("stream_complete", {
        capturedSessionId,
        groupId,
        chunkCount,
        responseLength: aiResponse.length,
      });

      // Reset browser search header
      setEnableBrowserSearch(false);

      // Clean AI SDK v4 - tool results are handled in onStepFinish callback
      // Document improvements are handled before streaming, so this is regular chat

      // Check if we got any response from the AI
      if (!aiResponse.trim()) {
        console.warn("[processUserMessage] Empty response from AI model after", chunkCount, "chunks");
        console.log("[processUserMessage] Message history length:", messageHistory.length);

        if (startsWithReasoning) {
          setMessagesInStore(capturedSessionId, (prev) => prev.filter(msg => msg.id !== aiMessageId));
          throw new Error(
            "The AI model returned an empty response. This might be due to rate limiting or model unavailability. Please try again.",
          );
        }

        // For empty responses in regular chat mode, retry with simpler prompt
        console.warn("[processUserMessage] Retrying with simpler approach due to empty response");

        const fallbackStream = streamText({
          model,
          messages: messageHistory,
          maxTokens: maxChatTokens,
          maxRetries: 1,
        });

        let fallbackResponse = "";
        for await (const chunk of fallbackStream.textStream) {
          fallbackResponse += chunk;
        }

        if (fallbackResponse.trim()) {
          console.log("[processUserMessage] Fallback without tools succeeded");
          aiResponse = fallbackResponse;
          reasoningResponse = "";
        } else {
          setMessagesInStore(capturedSessionId, (prev) => prev.filter(msg => msg.id !== aiMessageId));
          throw new Error(
            "The AI model returned an empty response. This might be due to rate limiting or model unavailability. Please try again.",
          );
        }
      }

      // Final synchronous update with complete response
      upsertAssistantMessage(true);

      // Save the final AI message to database
      const messagesInSession = getMessages(capturedSessionId);
      const finalMessage = messagesInSession.find(msg => msg.id === aiMessageId);

      await dbCommands.upsertChatMessage({
        id: aiMessageId,
        group_id: groupId,
        created_at: new Date().toISOString(),
        role: "Assistant",
        content: aiResponse.trim(),
        parts: finalMessage?.parts ? JSON.stringify(finalMessage.parts) : null,
      });

      console.log("[processUserMessage] Completed inference for captured sessionId:", capturedSessionId);
      logChatSubmit("process_success", {
        capturedSessionId,
        groupId,
        responseLength: aiResponse.trim().length,
      });
      // Use captured sessionId for generating state
      setGenerating(capturedSessionId, false);
      setIsProcessing(false);
      isProcessingRef.current = false;
      abortControllerRef.current = null;
      return true;
    } catch (error) {
      // Handle user-initiated abort gracefully
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[processUserMessage] Inference cancelled by user");
        setGenerating(capturedSessionId, false);
        setIsProcessing(false);
        isProcessingRef.current = false;
        abortControllerRef.current = null;
        return false;
      }

      console.error("[CHAT] Error:", error);
      logChatSubmit("process_error", {
        capturedSessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Use captured sessionId for generating state
      setGenerating(capturedSessionId, false);
      setIsProcessing(false);
      isProcessingRef.current = false;
      abortControllerRef.current = null;

      const errorMessageId = crypto.randomUUID();
      const errorDetails = error instanceof Error ? error.message : String(error);

      // Provide more specific error messages for common issues
      let userFriendlyMessage = `Sorry, I encountered an error: ${errorDetails}. Please try again.`;

      if (errorDetails.includes("Rate limit") || errorDetails.includes("429")) {
        userFriendlyMessage =
          "⏳ The AI model's rate limit has been reached. Please wait a moment and try again, or switch to a different model in Settings.";
      } else if (errorDetails.includes("empty response")) {
        userFriendlyMessage = "The AI model returned an empty response. This might be temporary - please try again.";
      }

      const aiMessage: Message = {
        id: errorMessageId,
        content: userFriendlyMessage,
        isUser: false,
        timestamp: new Date(),
      };
      // Use captured sessionId to ensure error appears in correct session
      setMessagesInStore(capturedSessionId, (prev) => [...prev, aiMessage]);

      await dbCommands.upsertChatMessage({
        id: errorMessageId,
        group_id: groupId,
        created_at: new Date().toISOString(),
        role: "Assistant",
        content: `Error: ${errorDetails}`,
        parts: null,
      });
      return false;
    }
  };

  const handleSubmit = async () => {
    logChatSubmit("submit_requested", {
      source: "chat-input",
      sessionId,
      inputLength: inputValue.trim().length,
      isGenerating,
      isProcessing,
      isProcessingRef: isProcessingRef.current,
    });

    const { accepted, capturedSessionId, trimmedContent } = beginSubmission(
      inputValue,
      "chat_message_sent",
      "chat-input",
    );

    if (!accepted || !capturedSessionId) {
      return false;
    }

    void processUserMessage(capturedSessionId, trimmedContent, "chat_message_sent");
    return true;
  };

  const handleSubmitWithValue = (value: string, options?: SubmitOptions) => {
    const source = options?.source ?? "programmatic";
    logChatSubmit("submit_with_value_requested", {
      source,
      sessionId,
      valueLength: value.trim().length,
      bypassDebounce: !!options?.bypassDebounce,
      isGenerating,
      isProcessing,
      isProcessingRef: isProcessingRef.current,
    });

    const { accepted, capturedSessionId, trimmedContent } = beginSubmission(
      value,
      "chat_message_sent",
      source,
      !!options?.bypassDebounce,
    );

    if (!accepted || !capturedSessionId) {
      return false;
    }

    void processUserMessage(capturedSessionId, trimmedContent, "chat_message_sent");
    return true;
  };

  const handleQuickAction = async (prompt: string) => {
    const { accepted, capturedSessionId, trimmedContent } = beginSubmission(
      prompt,
      "chat_quickaction_sent",
      "quick-action",
      true,
    );

    if (accepted && capturedSessionId) {
      void processUserMessage(capturedSessionId, trimmedContent, "chat_quickaction_sent");
    }

    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    void e;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  return {
    messages,
    isGenerating: isGenerating || isProcessing,
    handleSubmit,
    handleSubmitWithValue,
    handleQuickAction,
    handleApplyMarkdown,
    handleImproveWriting,
    handleKeyDown,
    handleStop,
  };
}
