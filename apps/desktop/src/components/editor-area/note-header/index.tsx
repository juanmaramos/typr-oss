import { Trans, useLingui } from "@lingui/react/macro";
import { useMatch } from "@tanstack/react-router";
import { type ChangeEvent } from "react";

import { Icon } from "@/components/ui/icon";
import { TemplateIcon } from "@/components/ui/template-icon";
import { useTypr } from "@/contexts";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { type Template } from "@typr/plugin-db";
import { getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";
import { useSession } from "@typr/utils/contexts";
import { useTitleGenerationPendingState } from "../../../hooks/enhance-pending";
import { Tab } from "../../ui/tab";
import { NOTE_WORKSPACE_COLUMN_CLASS, NOTE_WORKSPACE_COLUMN_STYLE } from "../layout";
import Chips from "./chips";
import { NoteActionsMenu } from "./note-actions-menu";
import { ShareMenu } from "./share-menu";
import TitleInput from "./title-input";
import TitleShimmer from "./title-shimmer";
import TranscriptionBar from "./transcription-bar";

export type NoteViewTab = "private" | "ai";

interface NoteHeaderProps {
  activeTab: NoteViewTab;
  onTabChange: (tab: NoteViewTab) => void;
  onOpenTranscript: () => void;
  onRegenerateAiNotes: () => void;
  onTemplateSelect: (templateId: string) => void;
  pendingTemplateId: string | null;
  templates: Template[];
  isGeneratingAiNotes: boolean;
  hasAiNotes: boolean;
  onNavigateToEditor?: () => void;
  editable?: boolean;
  sessionId: string;
  hashtags?: string[];
}

export function NoteHeader(
  {
    activeTab,
    onTabChange,
    onOpenTranscript,
    onRegenerateAiNotes,
    onTemplateSelect,
    pendingTemplateId,
    templates,
    isGeneratingAiNotes,
    hasAiNotes,
    onNavigateToEditor,
    editable,
    sessionId,
    hashtags = [],
  }: NoteHeaderProps,
) {
  const { t } = useLingui();
  const updateTitle = useSession(sessionId, (s) => s.updateTitle);
  const session = useSession(sessionId, (s) => s.session);
  const isTitleGenerating = useTitleGenerationPendingState(sessionId);
  const { thankYouSessionId } = useTypr();

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    updateTitle(e.target.value);
  };

  const noteMatch = useMatch({ from: "/app/note/$id", shouldThrow: false });
  const windowLabel = getCurrentWebviewWindowLabel();
  const isInNoteMain = windowLabel === "main" && noteMatch;

  const selectedTemplate = templates.find((template) => template.id === pendingTemplateId);
  const templateLabel = getTemplateDisplayName(
    selectedTemplate?.title || (pendingTemplateId ? t`Selected template` : t`Auto`),
    t`Auto`,
  );
  const handleOpenAllTemplates = () => {
    openSettingsWindow("/app/settings?tab=templates");
  };
  const handleOpenNewTemplate = () => {
    openSettingsWindow("/app/settings?tab=templates&action=new-template");
  };

  const canRegenerateSelectedTemplate = hasAiNotes;
  const templateRowClassName = "flex items-center gap-1 rounded-md";
  const selectedTemplateRowClassName = "bg-accent text-accent-foreground";
  const templateRowButtonClassName =
    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground";
  const selectedTemplateRowButtonClassName = "font-medium hover:bg-transparent focus:bg-transparent";

  return (
    <div className="w-full bg-background px-8 pb-3 pt-2">
      <div className={cn(NOTE_WORKSPACE_COLUMN_CLASS, "space-y-2")} style={NOTE_WORKSPACE_COLUMN_STYLE}>
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <TitleShimmer isShimmering={isTitleGenerating}>
              <TitleInput
                editable={editable}
                value={session.title}
                onChange={handleTitleChange}
                onNavigateToEditor={onNavigateToEditor}
                isGenerating={isTitleGenerating}
              />
            </TitleShimmer>

            <div className="flex flex-shrink-0 items-center">
              <NoteActionsMenu sessionId={sessionId} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <Chips sessionId={sessionId} hashtags={hashtags} />
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {isInNoteMain && sessionId !== thankYouSessionId && (
                <TranscriptionBar
                  sessionId={sessionId}
                  onOpenTranscript={onOpenTranscript}
                />
              )}
            </div>
          </div>
        </div>

        {(hasAiNotes || isGeneratingAiNotes) && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-5 border-b border-border/80">
                <Tab
                  text={t`Private notes`}
                  value="private"
                  selected={activeTab === "private"}
                  onSelect={() => onTabChange("private")}
                />
                <Tab
                  text={t`AI notes`}
                  value="ai"
                  selected={activeTab === "ai"}
                  onSelect={() => onTabChange("ai")}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeTab === "ai" && (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-2 rounded-full px-3 text-[13px] shadow-none"
                        >
                          {selectedTemplate
                            ? <TemplateIcon template={selectedTemplate} className="h-4 w-4 text-muted-foreground" />
                            : <Icon name="ri-sparkling-line" className="h-4 w-4 text-muted-foreground" />}
                          <span className="max-w-[180px] truncate">{templateLabel}</span>
                          <Icon name="ri-arrow-down-s-line" className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-72 p-1"
                      >
                        <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <Trans>Templates</Trans>
                        </div>
                        <div>
                          <div
                            className={cn(
                              templateRowClassName,
                              !pendingTemplateId && selectedTemplateRowClassName,
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => onTemplateSelect("auto")}
                              className={cn(
                                templateRowButtonClassName,
                                !pendingTemplateId && selectedTemplateRowButtonClassName,
                              )}
                            >
                              <Icon
                                name="ri-sparkling-line"
                                className={cn(
                                  "h-4 w-4 flex-shrink-0 text-muted-foreground",
                                  !pendingTemplateId && "text-foreground",
                                )}
                              />
                              <span className="truncate">{t`Auto`}</span>
                            </button>

                            {!pendingTemplateId && canRegenerateSelectedTemplate && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
                                onClick={onRegenerateAiNotes}
                                disabled={isGeneratingAiNotes}
                                aria-label={t`Regenerate with Auto`}
                              >
                                <Icon
                                  name={isGeneratingAiNotes ? "ri-loader-4-line" : "ri-refresh-line"}
                                  className={cn("h-4 w-4 text-muted-foreground", isGeneratingAiNotes && "animate-spin")}
                                />
                              </Button>
                            )}

                            {!pendingTemplateId && (
                              <Icon name="ri-check-line" className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                          </div>

                          {templates.map((template) => (
                            <div
                              key={template.id}
                              className={cn(
                                templateRowClassName,
                                pendingTemplateId === template.id && selectedTemplateRowClassName,
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => onTemplateSelect(template.id)}
                                className={cn(
                                  templateRowButtonClassName,
                                  pendingTemplateId === template.id && selectedTemplateRowButtonClassName,
                                )}
                              >
                                <TemplateIcon
                                  template={template}
                                  className={cn(
                                    "h-4 w-4 flex-shrink-0 text-muted-foreground",
                                    pendingTemplateId === template.id && "text-foreground",
                                  )}
                                />
                                <span className="truncate">
                                  {getTemplateDisplayName(template.title, t`Untitled template`)}
                                </span>
                              </button>

                              {pendingTemplateId === template.id && canRegenerateSelectedTemplate && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
                                  onClick={onRegenerateAiNotes}
                                  disabled={isGeneratingAiNotes}
                                  aria-label={t`Regenerate with ${template.title || t`Untitled template`}`}
                                >
                                  <Icon
                                    name={isGeneratingAiNotes ? "ri-loader-4-line" : "ri-refresh-line"}
                                    className={cn(
                                      "h-4 w-4 text-muted-foreground",
                                      isGeneratingAiNotes && "animate-spin",
                                    )}
                                  />
                                </Button>
                              )}

                              {pendingTemplateId === template.id && (
                                <Icon
                                  name="ri-check-line"
                                  className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground"
                                />
                              )}
                            </div>
                          ))}

                          <div className="-mx-1 my-1 h-px bg-muted" />

                          <div className={templateRowClassName}>
                            <button
                              type="button"
                              onClick={handleOpenAllTemplates}
                              className={cn(
                                templateRowButtonClassName,
                                "text-muted-foreground hover:text-accent-foreground",
                              )}
                            >
                              <Icon
                                name="ri-layout-grid-line"
                                className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                              />
                              <span className="truncate">
                                <Trans>All templates...</Trans>
                              </span>
                            </button>
                          </div>

                          <div className={templateRowClassName}>
                            <button
                              type="button"
                              onClick={handleOpenNewTemplate}
                              className={cn(
                                templateRowButtonClassName,
                                "text-muted-foreground hover:text-accent-foreground",
                              )}
                            >
                              <Icon name="ri-add-line" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                <Trans>New template</Trans>
                              </span>
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {hasAiNotes && (
                      <>
                        <ShareMenu session={session} />
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
