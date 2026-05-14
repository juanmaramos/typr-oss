import { useLingui } from "@lingui/react/macro";
// Remix Icon Components
function CheckIcon({ size = 16, className = "" }) {
  return <i className={`ri-check-line ${className}`} style={{ fontSize: size }} />;
}

function ClockIcon({ size = 16, className = "" }) {
  return <i className={`ri-chat-history-line ${className}`} style={{ fontSize: size }} />;
}

function CopyIcon({ size = 16, className = "" }) {
  return <i className={`ri-file-copy-line ${className}`} style={{ fontSize: size }} />;
}

function PlusIcon({ size = 16, className = "" }) {
  return <i className={`ri-add-line ${className}`} style={{ fontSize: size }} />;
}

function TextSearchIcon({ size = 16, className = "" }) {
  return <i className={`ri-menu-search-line ${className}`} style={{ fontSize: size }} />;
}
import { useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";

interface ChatHeaderProps {
  isGenerating?: boolean;
  hasMessages: boolean;
  onSearch: () => void;
  onCopy: () => void;
  isCopied: boolean;
  onNewChat: () => void;
  onViewHistory: () => void;
  chatGroups?: Array<{ id: string; created_at: string; firstMessage?: string }>;
  onSelectChatGroup?: (groupId: string) => void;
}

export function ChatHeader({
  isGenerating,
  hasMessages,
  onSearch,
  onCopy,
  isCopied,
  onNewChat,
  onViewHistory,
  chatGroups,
  onSelectChatGroup,
}: ChatHeaderProps) {
  const { t } = useLingui();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header className="flex items-center justify-between w-full px-4 py-2 bg-muted/50">
      {/* Left side: Activity indicator only */}
      <div className="flex items-center">
        {isGenerating && (
          <div className="relative h-1.5 w-1.5">
            <div className="absolute inset-0 rounded-full bg-info/30"></div>
            <div className="absolute inset-0 rounded-full bg-info animate-ping"></div>
          </div>
        )}
      </div>

      {/* Right side: All icons aligned */}
      <div className="not-draggable flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 hover:bg-background/60"
          onClick={onNewChat}
        >
          <PlusIcon size={14} className="text-muted-foreground" />
        </Button>

        {chatGroups && chatGroups.length > 0 && onSelectChatGroup && (
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 hover:bg-background/60"
              >
                <ClockIcon size={14} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {chatGroups.map((group, index) => (
                <DropdownMenuItem
                  key={group.id}
                  onClick={() => {
                    onSelectChatGroup(group.id);
                    setIsDropdownOpen(false);
                  }}
                >
                  {group.firstMessage
                    ? (group.firstMessage.length > 25
                      ? group.firstMessage.substring(0, 25) + "..."
                      : group.firstMessage)
                    : t`Chat Group ${index + 1}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {hasMessages && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 hover:bg-background/60"
              onClick={onSearch}
            >
              <TextSearchIcon size={14} className="text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 hover:bg-background/60"
              onClick={onCopy}
            >
              {isCopied
                ? <CheckIcon size={14} className="text-success" />
                : <CopyIcon size={14} className="text-muted-foreground" />}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
