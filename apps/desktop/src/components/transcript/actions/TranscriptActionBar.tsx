import { useLingui } from "@lingui/react/macro";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { writeText as writeTextToClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { ResponsiveIconButton } from "@typr/ui";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { cn } from "@typr/ui/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useLayoutEffect, useState } from "react";

function FindReplaceIcon({ size = 16, className = "" }) {
  return <i className={`ri-find-replace-line ${className}`} style={{ fontSize: size }} />;
}

function CopyIcon({ size = 16, className = "" }) {
  return <i className={`ri-file-copy-line ${className}`} style={{ fontSize: size }} />;
}

function CheckIcon({ size = 16, className = "" }) {
  return <i className={`ri-check-line ${className}`} style={{ fontSize: size }} />;
}

function SidebarIcon({ size = 16, className = "" }) {
  return <i className={`ri-layout-right-2-line ${className}`} style={{ fontSize: size }} />;
}

function MinimizeIcon({ size = 16, className = "" }) {
  return <IconArrowsDiagonalMinimize2 size={size} stroke={1.8} className={className} />;
}

function SparkleIcon({ size = 16, className = "" }) {
  return <i className={`ri-chat-ai-line ${className}`} style={{ fontSize: size }} />;
}

import { Tab } from "@/components/ui/tab";
import { useRightPanel } from "@/contexts";
import { useTranscriptionActive } from "@/hooks/useTranscriptionActive";
import { type TranscriptEditorRef } from "@typr/tiptap/transcript";

import { useSTTModel } from "../hooks/useSTTModel";
import type { TranscriptState } from "../hooks/useTranscriptState";
import { MicrophoneSelector } from "./MicrophoneSelector";
import { STTLanguageSelector } from "./STTLanguageSelector";

interface TranscriptActionBarProps {
  sessionId: string | null;
  editorRef?: React.RefObject<TranscriptEditorRef | null>;
  onSearchToggle?: (active: boolean) => void;
  isSearchActive?: boolean;
  transcriptState: TranscriptState;
  isLanguageChangeable: boolean;
  showTabs?: boolean;
  layout?: "sidebar" | "floating";
  onMoveToSidebar?: () => void;
  onClose?: () => void;
}

export function TranscriptActionBar({
  editorRef,
  onSearchToggle,
  isSearchActive = false,
  transcriptState,
  isLanguageChangeable,
  showTabs = true,
  layout = "sidebar",
  onMoveToSidebar,
  onClose,
}: TranscriptActionBarProps) {
  const { t } = useLingui();
  const { currentView, switchView } = useRightPanel();
  const { isRecordingActive } = useTranscriptionActive();
  const { selectedLanguage, handleLanguageChange, isChanging } = useSTTModel();
  const [copied, setCopied] = useState(false);
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);

  useLayoutEffect(() => {
    if (!toolbarElement) {
      return;
    }
    setPanelWidth(toolbarElement.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setPanelWidth(entry.contentRect.width);
      }
    });
    observer.observe(toolbarElement);
    return () => observer.disconnect();
  }, [toolbarElement]);

  const handleCopyAll = useCallback(async () => {
    if (editorRef?.current?.editor) {
      const text = editorRef.current.toText();
      await writeTextToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [editorRef]);

  const handleSearchToggle = useCallback(() => {
    onSearchToggle?.(!isSearchActive);
  }, [onSearchToggle, isSearchActive]);

  if (isSearchActive) {
    return null;
  }

  const isFloating = layout === "floating";
  const isCompact = panelWidth > 0 && panelWidth < 380;
  const showOverflow = isFloating && isCompact;
  const showTranscriptActions = transcriptState === "stopped";
  const showAsk = isFloating && !showTabs;
  const iconClass = cn(
    "h-7 w-7 text-foreground hover:text-foreground",
    isFloating ? "hover:bg-surface-400/70" : "hover:bg-background/50",
  );
  const copyLabel = copied ? t`Copied!` : t`Copy All`;
  const findLabel = t`Find & Replace`;

  return (
    <div className="relative" ref={setToolbarElement}>
      <div
        className={cn(
          "flex flex-nowrap items-center justify-between gap-2",
          isFloating
            ? "border-b border-border/60 bg-muted/25 px-5 py-2.5"
            : "px-4 py-3 bg-background",
        )}
      >
        {showTabs && (
          <div className="flex shrink-0 items-center gap-5 border-b border-border">
            <Tab text={t`Chat`} value="chat" selected={currentView === "chat"} onSelect={() => switchView("chat")} />
            <Tab
              text={t`Transcript`}
              value="transcript"
              selected={currentView === "transcript"}
              showRecordingIndicator={isRecordingActive}
              onSelect={() => switchView("transcript")}
            />
          </div>
        )}
        <div className={cn("flex min-w-0 flex-nowrap items-center", isFloating ? "flex-1 gap-4" : "gap-2")}>
          <div role="group" aria-label={t`Audio setup`} className="flex shrink-0 items-center gap-2">
            <MicrophoneSelector size="compact" isActive />
            <STTLanguageSelector
              value={selectedLanguage}
              onChange={handleLanguageChange}
              disabled={isChanging || (transcriptState === "active" && !isLanguageChangeable)}
              size="compact"
              isActive
            />
          </div>
          {(showTranscriptActions || showAsk) && (
            <div
              role="group"
              aria-label={t`Transcript actions`}
              className={cn("flex shrink-0 items-center gap-2", isFloating && "ml-auto")}
            >
              {showTranscriptActions && (showOverflow
                ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={iconClass}
                        aria-label={t`More transcript actions`}
                        title={t`More transcript actions`}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={handleSearchToggle}>
                        <FindReplaceIcon />
                        {findLabel}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void handleCopyAll()}>
                        <CopyIcon />
                        {copyLabel}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
                : (
                  <>
                    <ResponsiveIconButton
                      icon={FindReplaceIcon}
                      text={findLabel}
                      onClick={handleSearchToggle}
                      displayMode="icon"
                      variant="ghost"
                      size="icon"
                      className={iconClass}
                    />
                    <ResponsiveIconButton
                      icon={copied ? CheckIcon : CopyIcon}
                      text={copyLabel}
                      onClick={handleCopyAll}
                      displayMode="icon"
                      variant="ghost"
                      size="icon"
                      className={cn(iconClass, copied && "text-success")}
                    />
                  </>
                ))}
              {showAsk && (
                <ResponsiveIconButton
                  icon={SparkleIcon}
                  text={t`Ask AI`}
                  onClick={() => switchView("chat")}
                  displayMode="icon"
                  variant="ghost"
                  size="icon"
                  className={iconClass}
                />
              )}
            </div>
          )}
          {isFloating && (onMoveToSidebar || onClose) && (
            <div role="group" aria-label={t`Window controls`} className="ml-auto flex shrink-0 items-center gap-2">
              {onMoveToSidebar && (
                <ResponsiveIconButton
                  icon={SidebarIcon}
                  text={t`Move to sidebar`}
                  onClick={onMoveToSidebar}
                  displayMode="icon"
                  variant="ghost"
                  size="icon"
                  className={iconClass}
                />
              )}
              {onClose && (
                <ResponsiveIconButton
                  icon={MinimizeIcon}
                  text={t`Minimize`}
                  onClick={onClose}
                  displayMode="icon"
                  variant="ghost"
                  size="icon"
                  className={iconClass}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
