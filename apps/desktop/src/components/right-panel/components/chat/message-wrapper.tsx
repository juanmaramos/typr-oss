import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { MessageAction, MessageActions } from "@/components/ui/message-action";
import { ProcessingSteps } from "@/components/ui/processing-steps";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ui/reasoning";
import { ThinkingBar } from "@/components/ui/thinking-bar";
import { Tool } from "@/components/ui/tool";
import { useChatState } from "@/stores/useChatState";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { acceptInlineDiff, rejectInlineDiff } from "@/utils/inline-diff-preview";
import { commands as dbCommands } from "@typr/plugin-db";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { DiffPreview } from "./diff-preview";
import { InlineDiffSummary } from "./inline-diff-summary";
import { Message as MessageType } from "./types";

interface MessageWrapperProps {
  message: MessageType;
  sessionTitle?: string;
  hasEnhancedNote?: boolean;
  onApplyMarkdown?: (markdownContent: string) => void;
  sessionId?: string;
  editMode?: "chat" | "edit";
  chatGroupId?: string; // Current chat group ID for saving status updates
}

export function MessageWrapper({
  message,
  sessionTitle,
  hasEnhancedNote,
  onApplyMarkdown,
  sessionId,
  editMode = "chat",
  chatGroupId,
}: MessageWrapperProps) {
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const { clearSelection } = useSelectionContext();
  const hasContent = message.content.trim().length > 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  return (
    <Message className={message.isUser ? "items-end" : "items-start"}>
      <div className={`flex flex-col gap-2 ${message.isUser ? "items-end" : "w-full"}`}>
        {(message.isUser || hasContent) && (
          <MessageContent
            markdown={true}
            messageId={message.id} // Pass message ID for memoization
            sources={message.sources} // Pass source URLs for citations
            className={
              message.isUser
                ? "bg-muted p-2 px-2.5 rounded-lg inline-block max-w-3xl" // User message style (smaller padding for compact look)
                : "bg-transparent p-0 w-full max-w-3xl" // AI message style
            }
          >
            {message.content}
          </MessageContent>
        )}

        {/* Render message parts */}
        {message.parts?.map((part, index) => {
          if (part.type === "reasoning") {
            const isStreaming = part.isComplete === false;
            const hasReasoning = part.content.trim().length > 0;

            return (
              <div key={index} className="w-full max-w-3xl">
                {isStreaming && (
                  <ThinkingBar
                    text={t`Thinking`}
                    onClick={hasReasoning ? () => setReasoningOpen(open => !open) : undefined}
                    className="py-1"
                  />
                )}
                {hasReasoning && (
                  <Reasoning
                    open={reasoningOpen}
                    onOpenChange={setReasoningOpen}
                    className={isStreaming ? "mt-1" : ""}
                  >
                    {!isStreaming && (
                      <ReasoningTrigger className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                        {t`Show reasoning`}
                      </ReasoningTrigger>
                    )}
                    <ReasoningContent
                      markdown
                      className="ml-1 border-l border-border px-3 pb-1 pt-1"
                      contentClassName="text-xs leading-relaxed prose-p:my-1 prose-li:my-0.5"
                    >
                      {part.content}
                    </ReasoningContent>
                  </Reasoning>
                )}
              </div>
            );
          }

          // Inline diff summary part (NEW - Cursor-style)
          if (part.type === "inline-diff-summary" && part.inlineDiffData && sessionId) {
            const editorRef = window.__TYPR_EDITORS__?.[sessionId];
            const editor = editorRef?.editor;

            const handleAccept = () => {
              console.log("🎯 [MessageWrapper] Accept clicked - will clear selection");
              if (editor && acceptInlineDiff(editor, sessionId)) {
                // Update message in store with proper immutability (React re-render)
                const { setMessages } = useChatState.getState();
                setMessages(sessionId, (prevMessages) => {
                  return prevMessages.map(msg => {
                    if (msg.id === message.id) {
                      return {
                        ...msg,
                        parts: msg.parts?.map(p => {
                          if (p === part && p.inlineDiffData) {
                            return {
                              ...p,
                              inlineDiffData: {
                                ...p.inlineDiffData,
                                status: "accepted" as const,
                              },
                            };
                          }
                          return p;
                        }),
                      };
                    }
                    return msg;
                  });
                });

                // Save updated status to database
                const updatedMessage = useChatState.getState().getMessages(sessionId).find(m => m.id === message.id);
                if (updatedMessage && chatGroupId) {
                  dbCommands.upsertChatMessage({
                    id: message.id,
                    group_id: chatGroupId,
                    created_at: message.timestamp.toISOString(),
                    role: "Assistant",
                    content: message.content,
                    parts: JSON.stringify(updatedMessage.parts),
                  });
                  console.log("🎯 [MessageWrapper] Status 'accepted' saved to DB");
                }

                // Clear selection badge since edit is complete
                clearSelection();
                console.log("🎯 [MessageWrapper] Selection cleared after accept");
              }
            };

            const handleReject = () => {
              console.log("🎯 [MessageWrapper] Reject clicked - will clear selection");
              if (editor && rejectInlineDiff(editor, sessionId)) {
                // Update message in store with proper immutability (React re-render)
                const { setMessages } = useChatState.getState();
                setMessages(sessionId, (prevMessages) => {
                  return prevMessages.map(msg => {
                    if (msg.id === message.id) {
                      return {
                        ...msg,
                        parts: msg.parts?.map(p => {
                          if (p === part && p.inlineDiffData) {
                            return {
                              ...p,
                              inlineDiffData: {
                                ...p.inlineDiffData,
                                status: "rejected" as const,
                              },
                            };
                          }
                          return p;
                        }),
                      };
                    }
                    return msg;
                  });
                });

                // Save updated status to database
                const updatedMessage = useChatState.getState().getMessages(sessionId).find(m => m.id === message.id);
                if (updatedMessage && chatGroupId) {
                  dbCommands.upsertChatMessage({
                    id: message.id,
                    group_id: chatGroupId,
                    created_at: message.timestamp.toISOString(),
                    role: "Assistant",
                    content: message.content,
                    parts: JSON.stringify(updatedMessage.parts),
                  });
                  console.log("🎯 [MessageWrapper] Status 'rejected' saved to DB");
                }

                // Clear selection badge since edit was rejected
                clearSelection();
                console.log("🎯 [MessageWrapper] Selection cleared after reject");
              }
            };

            return (
              <InlineDiffSummary
                key={index}
                changeType={part.inlineDiffData.changeType}
                characterCount={part.inlineDiffData.characterCount}
                preview={part.inlineDiffData.preview}
                reasoning={part.inlineDiffData.reasoning}
                initialStatus={part.inlineDiffData.status || "pending"}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            );
          }

          // Diff preview part (OLD - chat-based diff)
          if (part.type === "diff-preview" && part.diffData && sessionId) {
            return (
              <DiffPreview
                key={index}
                original={part.diffData.original}
                edited={part.diffData.edited}
                reasoning={part.diffData.reasoning}
                range={part.diffData.range}
                sessionId={sessionId}
              />
            );
          }

          // Processing steps part
          if (part.type === "processing-steps" && part.processingSteps) {
            return (
              <ProcessingSteps
                key={index}
                steps={part.processingSteps}
                className="mt-3"
              />
            );
          }

          // Tool execution part (using prompt-kit Tool component)
          if (part.type === "tool-execution" && part.toolData) {
            return (
              <Tool
                key={index}
                toolPart={{
                  type: part.toolData.type,
                  state: part.toolData.status === "pending"
                    ? "pending"
                    : part.toolData.status === "running"
                    ? "running"
                    : part.toolData.status === "completed"
                    ? "output-available"
                    : "error",
                  input: part.toolData.input,
                  output: part.toolData.output,
                  errorText: part.toolData.errorMessage,
                }}
                defaultOpen={false}
                className="mt-3"
              />
            );
          }

          return null;
        })}

        {/* Message actions - only show for regular messages, not diff previews or inline diffs */}
        {!message.isUser
          && hasContent
          && !message.parts?.some(part => part.type === "diff-preview" || part.type === "inline-diff-summary") && (
          <MessageActions>
            {/* Add to Note - only show in Ask mode */}
            {hasEnhancedNote && editMode === "chat" && (
              <MessageAction tooltip={t`Add to note`}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onApplyMarkdown?.(message.content)}
                >
                  <i className="ri-text-wrap text-base" />
                </Button>
              </MessageAction>
            )}

            <MessageAction tooltip={copied ? "Copied!" : "Copy to clipboard"}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 transition-all duration-200"
                onClick={handleCopy}
              >
                {copied
                  ? <i className="ri-check-line text-base text-success" />
                  : <i className="ri-file-copy-line text-base" />}
              </Button>
            </MessageAction>
          </MessageActions>
        )}
      </div>
    </Message>
  );
}
