import { Loader } from "@/components/ui/loader";
import { Message as MessageComponent, MessageContent } from "@/components/ui/message";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageWrapper } from "./message-wrapper";
import { Message } from "./types";

interface ChatMessagesViewProps {
  messages: Message[];
  sessionTitle?: string;
  hasEnhancedNote?: boolean;
  onApplyMarkdown?: (markdownContent: string) => void;
  isGenerating?: boolean;
  sessionId?: string;
  editMode?: "chat" | "edit";
  chatGroupId?: string; // Current chat group ID for persisting status
  layout?: "sidebar" | "floating";
}

export function ChatMessagesView(
  {
    messages,
    sessionTitle,
    hasEnhancedNote,
    onApplyMarkdown,
    isGenerating = false,
    sessionId,
    editMode = "chat",
    chatGroupId,
    layout = "sidebar",
  }: ChatMessagesViewProps,
) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    // User is "at bottom" if within 80px of the end
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setUserScrolledUp(!atBottom);
  }, []);

  useEffect(() => {
    if (userScrolledUp) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({
      behavior: isGenerating ? "instant" : "smooth",
    });
  }, [messages, isGenerating, userScrolledUp]);

  // Reset scroll lock when generation finishes
  useEffect(() => {
    if (!isGenerating) {
      setUserScrolledUp(false);
    }
  }, [isGenerating]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={layout === "floating"
        ? "flex-1 overflow-y-auto bg-background px-3.5 pt-4 pb-2 space-y-4 select-text"
        : "flex-1 overflow-y-auto px-4 py-6 space-y-6 select-text bg-background"}
    >
      {messages.map((message) => (
        <MessageWrapper
          key={message.id}
          message={message}
          sessionTitle={sessionTitle}
          hasEnhancedNote={hasEnhancedNote}
          onApplyMarkdown={onApplyMarkdown}
          sessionId={sessionId}
          editMode={editMode}
          chatGroupId={chatGroupId}
        />
      ))}

      {/* Typing indicator only while waiting for first content to appear */}
      {isGenerating && messages.length > 0
        // Check if the last message is from the user (no AI response yet)
        && (messages[messages.length - 1].isUser) && (
        <MessageComponent className="items-start">
          <div className="flex w-full flex-col gap-2">
            <MessageContent markdown={false} className="bg-transparent p-0 w-full max-w-3xl">
              <Loader variant="typing" size="md" />
            </MessageContent>
          </div>
        </MessageComponent>
      )}

      <div ref={messagesEndRef} className={layout === "floating" ? "h-2" : "h-4"} />
    </div>
  );
}
