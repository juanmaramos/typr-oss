import { Button } from "@typr/ui/components/ui/button";

import { ChatSession } from "./types";

interface ChatHistoryItemProps {
  chat: ChatSession;
  onSelect: (chatId: string) => void;
  formatDate: (date: Date) => string;
}

export function ChatHistoryItem({ chat, onSelect, formatDate }: ChatHistoryItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(chat.id)}
      className="h-auto w-full justify-start rounded-none px-4 py-3 text-left whitespace-normal hover:bg-surface-400"
    >
      <div className="flex justify-between items-center">
        <div className="font-medium text-sm">{chat.title}</div>
        <div className="text-xs text-muted-foreground">{formatDate(chat.lastMessageDate)}</div>
      </div>
    </Button>
  );
}
