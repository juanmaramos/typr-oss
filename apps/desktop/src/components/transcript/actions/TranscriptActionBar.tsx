import { ResponsiveIconButton } from "@typr/ui";
import { cn } from "@typr/ui/lib/utils";
import { useLingui } from "@lingui/react/macro";
import { IconArrowsDiagonalMinimize2 } from "@tabler/icons-react";
import { writeText as writeTextToClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useState } from "react";

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
import { AudioSettingsButton } from "./AudioSettingsButton";
import { MicrophoneSelector } from "./MicrophoneSelector";
import { STTLanguageSelector } from "./STTLanguageSelector";

interface TranscriptActionBarProps {
  sessionId: string | null;
  panelWidth: number;
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
  sessionId,
  panelWidth,
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

  const isCompact = panelWidth < 380;

  return (
    <div className="relative">
      <div
        className={layout === "floating"
          ? "flex items-center justify-between border-b border-border/60 bg-muted/25 px-5 py-2.5"
          : "flex items-center justify-between px-4 py-3 bg-background"}
        style={{ gap: "8px" }}
      >
        {showTabs
          ? (
            <div className="flex items-center gap-5 border-b border-border">
              <Tab
                text={t`Chat`}
                value="chat"
                selected={currentView === "chat"}
                onSelect={(value) => switchView(value as "chat" | "transcript")}
              />
              <Tab
                text={t`Transcript`}
                value="transcript"
                selected={currentView === "transcript"}
                showRecordingIndicator={isRecordingActive}
                onSelect={(value) => switchView(value as "chat" | "transcript")}
              />
            </div>
          )
          : <div />}

        <div className="flex items-center gap-2">
          {transcriptState === "active" && (
            <>
              <MicrophoneSelector
                size={isCompact ? "compact" : "full"}
                isActive={true}
              />
              <STTLanguageSelector
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={!isLanguageChangeable || isChanging}
                size={isCompact ? "compact" : "full"}
                isActive={true}
              />
              <div className="hidden">
                <AudioSettingsButton
                  displayMode={isCompact ? "icon" : "full"}
                  variant="ghost"
                  className="h-7 text-muted-foreground hover:text-foreground hover:bg-surface-400"
                  size="sm"
                />
              </div>
            </>
          )}

          {transcriptState === "empty" && (
            <>
              <MicrophoneSelector
                size="compact"
                isActive={false}
              />
              <STTLanguageSelector
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={isChanging}
                size="compact"
                isActive={true}
              />
            </>
          )}

          {transcriptState === "stopped" && (
            <>
              <MicrophoneSelector
                size={isCompact ? "compact" : "full"}
                isActive={true}
              />
              <STTLanguageSelector
                value={selectedLanguage}
                onChange={handleLanguageChange}
                disabled={isChanging}
                size={isCompact ? "compact" : "full"}
                isActive={true}
              />
              <div className="hidden">
                <AudioSettingsButton
                  displayMode={isCompact ? "icon" : "full"}
                  variant="ghost"
                  className="h-7 text-muted-foreground hover:text-foreground hover:bg-surface-400"
                  size="sm"
                />
              </div>
              <ResponsiveIconButton
                icon={FindReplaceIcon}
                text={t`Find & Replace`}
                onClick={handleSearchToggle}
                displayMode="icon"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 text-foreground hover:text-foreground",
                  layout === "floating" ? "hover:bg-surface-400/70" : "hover:bg-background/50",
                )}
              />
              <ResponsiveIconButton
                icon={copied ? CheckIcon : CopyIcon}
                text={copied ? t`Copied!` : t`Copy All`}
                onClick={handleCopyAll}
                displayMode="icon"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 transition-all duration-200",
                  layout === "floating" ? "hover:bg-surface-400/70" : "hover:bg-background/50",
                  copied ? "text-success" : "text-foreground hover:text-foreground",
                )}
              />
            </>
          )}

          {layout === "floating" && !showTabs && (
            <ResponsiveIconButton
              icon={SparkleIcon}
              text={t`Ask AI`}
              onClick={() => {
                switchView("chat");
              }}
              displayMode="icon"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
            />
          )}

          {layout === "floating" && onMoveToSidebar && (
            <ResponsiveIconButton
              icon={SidebarIcon}
              text={t`Move to sidebar`}
              onClick={onMoveToSidebar}
              displayMode="icon"
              variant="ghost"
              className="h-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
            />
          )}

          {layout === "floating" && onClose && (
            <ResponsiveIconButton
              icon={MinimizeIcon}
              text={t`Minimize`}
              onClick={onClose}
              displayMode="icon"
              variant="ghost"
              className="h-7 text-foreground hover:text-foreground hover:bg-surface-400/70"
            />
          )}
        </div>
      </div>
    </div>
  );
}
