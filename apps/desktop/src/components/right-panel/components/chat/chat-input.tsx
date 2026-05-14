import { Trans } from "@lingui/react/macro";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpIcon, BuildingIcon, FileTextIcon, SquareIcon, TextSelectIcon, UserIcon, XIcon } from "lucide-react";
import { useEffect } from "react";

import { ModelSelector } from "@/components/ui/model-selector";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { promptInputClassNames, promptTextareaContracts } from "@/components/ui/prompt-input-contracts";
import { debugLogFor } from "@/components/utils/debug-logger";
import { useRightPanel } from "@/contexts";
import { useAgentWritingFeature } from "@/hooks/use-agent-writing-feature";
import { useSelectionContext } from "@/stores/useSelectionContext";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";
import { SHOW_WEB_SEARCH_IN_CHAT_INPUT } from "../../constants/features";
import { BadgeType } from "../../types/chat-types";
import { ModeSelector } from "./mode-selector";

const logFloatingChatInput = (event: string, payload?: Record<string, unknown>) => {
  debugLogFor("DEBUG_FLOATING", "FloatingDebug", `chat-input:${event}`, payload ?? {});
};

interface ChatInputProps {
  inputValue: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
  entityId?: string;
  entityType?: BadgeType;
  onNoteBadgeClick?: () => void;
  isGenerating?: boolean;
  editMode?: "chat" | "edit";
  onEditModeChange?: (mode: "chat" | "edit") => void;
  researchMode?: boolean;
  onResearchModeChange?: (enabled: boolean) => void;
  layout?: "sidebar" | "floating";
}

export function ChatInput(
  {
    inputValue,
    onChange,
    onSubmit,
    onStop,
    onKeyDown,
    autoFocus = false,
    entityId,
    entityType = "note",
    onNoteBadgeClick,
    isGenerating = false,
    editMode = "chat",
    onEditModeChange,
    researchMode = false,
    onResearchModeChange,
    layout = "sidebar",
  }: ChatInputProps,
) {
  const { t } = useLingui();
  const { chatInputRef } = useRightPanel();
  const isAgentWritingEnabled = useAgentWritingFeature();
  const isFloatingLayout = layout === "floating";

  const { data: noteData } = useQuery({
    queryKey: ["session", entityId],
    queryFn: async () => entityId ? dbCommands.getSession({ id: entityId }) : null,
    enabled: !!entityId && entityType === "note",
  });

  const { data: humanData } = useQuery({
    queryKey: ["human", entityId],
    queryFn: async () => entityId ? dbCommands.getHuman(entityId) : null,
    enabled: !!entityId && entityType === "human",
  });

  const { data: organizationData } = useQuery({
    queryKey: ["org", entityId],
    queryFn: async () => entityId ? dbCommands.getOrganization(entityId) : null,
    enabled: !!entityId && entityType === "organization",
  });

  const getEntityTitle = () => {
    if (!entityId) {
      return "";
    }

    switch (entityType) {
      case "note":
        return noteData?.title || "New note";
      case "human":
        return humanData?.full_name || "";
      case "organization":
        return organizationData?.name || "";
      default:
        return "";
    }
  };

  useEffect(() => {
    if (autoFocus && chatInputRef.current) {
      chatInputRef.current.focus();
      if (import.meta.env.DEV && isFloatingLayout) {
        logFloatingChatInput("auto_focus", {
          inputLength: inputValue.length,
          activeElementTag: document.activeElement?.tagName ?? null,
          placeholder: chatInputRef.current.getAttribute("placeholder"),
        });
      }
    }
  }, [autoFocus, chatInputRef, inputValue.length, isFloatingLayout]);

  const getBadgeIcon = () => {
    switch (entityType) {
      case "human":
        return <UserIcon className="size-3 mr-0.5" />;
      case "organization":
        return <BuildingIcon className="size-3 mr-0.5" />;
      case "note":
      default:
        return <FileTextIcon className="size-3 mr-0.5" />;
    }
  };

  const entityTitle = getEntityTitle();
  const showEntityBadge = !!entityId && !isFloatingLayout;
  // Selection context
  const { selectedText, clearSelection, sessionId: selectionSessionId } = useSelectionContext();

  // Handler to clear both badge and editor decoration
  const handleClearSelection = () => {
    // Clear the chat badge
    clearSelection();

    // Clear the editor decoration if editor is available
    if (selectionSessionId) {
      const editorRef = window.__TYPR_EDITORS__?.[selectionSessionId];
      if (editorRef?.editor) {
        editorRef.editor.commands.unsetAISelection();
        console.log("🎯 [ChatInput] Cleared AI selection decoration from editor");
      }
    }
  };

  const handleValueChange = (value: string) => {
    // Create a synthetic event to match the existing onChange signature
    const syntheticEvent = {
      target: { value },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange(syntheticEvent);
  };

  return (
    <div className={cn("bg-transparent", isFloatingLayout ? "mx-3 mb-2" : "mx-4 mb-4")}>
      {selectedText && (
        <div className="mb-2 ml-1 flex items-center gap-3">
          <div className="inline-flex h-6 max-w-[240px] items-center gap-1.5 rounded-md border border-[hsl(var(--sidebar-primary))]/20 bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-[hsl(var(--sidebar-primary))]/30">
            <TextSelectIcon className="size-3 flex-shrink-0 text-[hsl(var(--sidebar-primary))]" />
            <span className="truncate">
              {selectedText.length > 60 ? selectedText.slice(0, 60) + "..." : selectedText}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleClearSelection();
              }}
              className="size-4 flex-shrink-0 rounded p-0 opacity-60 hover:bg-surface-400/80 hover:opacity-100"
              aria-label={t`Clear selection`}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        {editMode === "edit" && <div className={promptInputClassNames.editAura} />}
        <div className="relative z-10">
          <PromptInput
            value={inputValue}
            onValueChange={handleValueChange}
            onSubmit={onSubmit}
            isLoading={isGenerating}
            maxHeight={isFloatingLayout ? 136 : 128}
            debugName={isFloatingLayout ? "floating-chat" : undefined}
            className={editMode === "edit"
              ? cn(
                "shadow-2xs border-[hsl(var(--sidebar-primary))]/20 hover:border-[hsl(var(--sidebar-primary))]/30 transition-all duration-300 bg-background/80 backdrop-blur-xl",
                isFloatingLayout
                  ? promptInputClassNames.floatingInlineSurface
                  : "",
              )
              : cn(
                "shadow-2xs border-border/50 hover:border-border transition-colors",
                isFloatingLayout
                  ? promptInputClassNames.floatingInlineSurface
                  : "",
              )}
          >
            <div className="flex flex-col gap-2">
              {/* Top toolbar - Entity Context */}
              {showEntityBadge && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={onNoteBadgeClick}
                      className="h-7 max-w-[240px] justify-start gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-surface-400 hover:text-foreground"
                    >
                      {getBadgeIcon()}
                      <span className="truncate max-w-[200px]">{entityTitle}</span>
                    </Button>
                  </div>
                </div>
              )}

              {isFloatingLayout
                ? (
                  <div className="flex min-w-0 items-end gap-2.5">
                    <PromptInputTextarea
                      ref={chatInputRef}
                      minHeight={promptTextareaContracts.floatingInline.minHeight}
                      placeholder={editMode === "edit"
                        ? t`Describe the changes you want to make...`
                        : t`Ask about this meeting...`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          logFloatingChatInput("enter_submit", {
                            inputLength: inputValue.trim().length,
                            editMode,
                            researchMode,
                          });
                        }
                        onKeyDown(event);
                      }}
                      className={cn("min-w-0 flex-1", promptTextareaContracts.floatingInline.className)}
                      disabled={isGenerating}
                    />

                    <PromptInputActions className="ml-auto flex-shrink-0 self-end gap-1">
                      <ModelSelector compact className="h-8 px-2.5 gap-1.5" />
                      {onEditModeChange && isAgentWritingEnabled && (
                        <ModeSelector
                          currentMode={editMode}
                          onModeChange={onEditModeChange}
                          className="h-8 px-2.5 gap-1.5"
                        />
                      )}
                      {SHOW_WEB_SEARCH_IN_CHAT_INPUT && onResearchModeChange && editMode === "chat" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onResearchModeChange(!researchMode);
                          }}
                          className={cn(
                            "h-8 px-2.5 gap-1.5 focus-visible:ring-1 focus-visible:ring-ring transition-all duration-300 ease-out",
                            researchMode
                              ? "bg-primary/10 text-primary hover:bg-primary/15"
                              : "text-muted-foreground hover:bg-surface-400 hover:text-foreground",
                          )}
                          aria-label={t`Web search`}
                        >
                          <i
                            className={cn(
                              "ri-global-line text-base transition-all duration-300 ease-out",
                              researchMode && "scale-110",
                            )}
                          />
                          {researchMode && (
                            <span className="chat-control-label-enter overflow-hidden text-xs font-medium">
                              <Trans>Search</Trans>
                            </span>
                          )}
                        </Button>
                      )}

                      <PromptInputAction tooltip={isGenerating ? t`Stop generating` : t`Send message`} side="top">
                        {isGenerating && onStop
                          ? (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={onStop}
                              className="h-9 w-9 shrink-0 rounded-full border-border/80 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <SquareIcon className="h-3 w-3 fill-current" />
                            </Button>
                          )
                          : (
                            <Button
                              variant="default"
                              size="icon"
                              onClick={() => {
                                logFloatingChatInput("button_submit", {
                                  inputLength: inputValue.trim().length,
                                  editMode,
                                  researchMode,
                                });
                                onSubmit();
                              }}
                              disabled={!inputValue.trim() || isGenerating}
                              className="h-9 w-9 shrink-0 rounded-full p-0"
                            >
                              <ArrowUpIcon className="h-4 w-4 text-primary-foreground" />
                            </Button>
                          )}
                      </PromptInputAction>
                    </PromptInputActions>
                  </div>
                )
                : (
                  <>
                    <PromptInputTextarea
                      ref={chatInputRef}
                      minHeight={promptTextareaContracts.sidebar.minHeight}
                      placeholder={editMode === "edit"
                        ? t`Describe the changes you want to make...`
                        : t`Ask about this meeting...`}
                      onKeyDown={onKeyDown}
                      className={promptTextareaContracts.sidebar.className}
                      disabled={isGenerating}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ModelSelector compact={false} />
                        {onEditModeChange && isAgentWritingEnabled && (
                          <ModeSelector
                            currentMode={editMode}
                            onModeChange={onEditModeChange}
                          />
                        )}
                        {SHOW_WEB_SEARCH_IN_CHAT_INPUT && onResearchModeChange && editMode === "chat" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onResearchModeChange(!researchMode);
                            }}
                            className={cn(
                              "h-8 px-2 gap-1.5 focus-visible:ring-1 focus-visible:ring-ring transition-all duration-300 ease-out",
                              researchMode
                                ? "bg-primary/10 text-primary hover:bg-primary/15"
                                : "text-muted-foreground hover:bg-surface-400 hover:text-foreground",
                            )}
                            aria-label={t`Web search`}
                          >
                            <i
                              className={cn(
                                "ri-global-line text-base transition-all duration-300 ease-out",
                                researchMode && "scale-110",
                              )}
                            />
                            {researchMode && (
                              <span className="chat-control-label-enter overflow-hidden text-xs font-medium">
                                <Trans>Search</Trans>
                              </span>
                            )}
                          </Button>
                        )}
                      </div>

                      <PromptInputActions>
                        <PromptInputAction tooltip={isGenerating ? t`Stop generating` : t`Send message`} side="top">
                          {isGenerating && onStop
                            ? (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={onStop}
                                className="h-8 w-8 shrink-0 rounded-full border-border/80 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <SquareIcon className="h-3 w-3 fill-current" />
                              </Button>
                            )
                            : (
                              <Button
                                variant="default"
                                size="icon"
                                onClick={onSubmit}
                                disabled={!inputValue.trim() || isGenerating}
                                className="h-8 w-8 shrink-0 rounded-full p-0"
                              >
                                <ArrowUpIcon className="h-4 w-4 text-primary-foreground" />
                              </Button>
                            )}
                        </PromptInputAction>
                      </PromptInputActions>
                    </div>
                  </>
                )}
            </div>
          </PromptInput>
        </div>
      </div>

      {/* Privacy Disclaimer */}
      <div className="hidden w-full mt-2 px-1">
        <p className="text-[10px] text-muted-foreground leading-relaxed text-center w-full">
          <Trans>
            Your conversations are private and never used for AI models training. Typr may make mistakes, so verify its
            responses.
          </Trans>
        </p>
      </div>
    </div>
  );
}
