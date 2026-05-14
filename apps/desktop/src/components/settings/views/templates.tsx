import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { TemplateIcon } from "@/components/ui/template-icon";
import { useTypr } from "@/contexts";
import type { SettingsDialogAction } from "@/contexts/settings-dialog";
import { isDefaultTemplate } from "@/utils/default-templates";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { TemplateService } from "@/utils/template-service";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { commands as configCommands } from "@typr/plugin-config";
import { type Template } from "@typr/plugin-db";
import { commands as dbCommands } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import TemplateEditor from "./template";

type ViewState = "list" | "editor" | "new";

interface TemplatesViewProps {
  pendingAction?: SettingsDialogAction | null;
  onPendingActionConsumed?: () => void;
}

export default function TemplatesView({
  pendingAction,
  onPendingActionConsumed,
}: TemplatesViewProps) {
  const { userId } = useTypr();

  const [viewState, setViewState] = useState<ViewState>("list");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<Set<string>>(new Set());
  const consumedPendingActionRef = useRef<SettingsDialogAction | null>(null);
  const queryClient = useQueryClient();

  // Load config to get selected template
  const config = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
  });

  // Mutation to save selected template
  const selectTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!config.data) {
        console.error("Cannot save selected template because config is not loaded");
        return;
      }

      // Use the same pattern as general.tsx - preserve all existing fields
      const newGeneralConfig = {
        ...config.data,
        selected_template_id: templateId || null, // Set to null for empty string (Auto)
      };

      await configCommands.setGeneralConfig(newGeneralConfig);
    },
    onSuccess: () => {
      // Invalidate all config-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      // Also invalidate templates queries that depend on config
      queryClient.invalidateQueries({ queryKey: ["templates", "popover"] });
    },
    onError: (error) => {
      console.error("❌ Failed to save selected template:", error);
    },
  });

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);

      // Use TemplateService to get categorized templates
      const { custom, builtin } = await TemplateService.getTemplatesByCategory();
      console.log("loaded templates - custom:", custom, "builtin:", builtin);

      // Load favorite template IDs
      const favoriteIds = await TemplateService.getFavoriteTemplates();
      setFavoriteTemplateIds(new Set(favoriteIds.map(t => t.id)));

      setCustomTemplates(custom);
      setBuiltinTemplates(builtin);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  };

  // Separate template selection from editing
  const handleTemplateSelect = (template: Template) => {
    // Check if this template is already selected
    if (template.id === selectedTemplateId) {
      // Deselect by setting to empty string (which becomes null in mutation)
      selectTemplateMutation.mutate("");
    } else {
      // Select this template
      analyticsCommands.event({
        event: "template_selected",
        distinct_id: userId,
      });

      selectTemplateMutation.mutate(template.id);
    }
  };

  // Handle template editing/viewing - now supports both custom and built-in templates
  const handleTemplateEdit = (template: Template) => {
    setSelectedTemplate(template);
    setViewState("editor");
  };

  const handleNewTemplate = async () => {
    analyticsCommands.event({
      event: "template_created",
      distinct_id: userId,
    });

    const newTemplate: Template = {
      id: crypto.randomUUID(),
      user_id: userId,
      title: "",
      description: "",
      sections: [],
      tags: [],
    };
    setSelectedTemplate(newTemplate);
    setViewState("new");
  };

  useEffect(() => {
    if (pendingAction !== "new-template") {
      consumedPendingActionRef.current = null;
      return;
    }

    if (loading || consumedPendingActionRef.current === pendingAction) {
      return;
    }

    consumedPendingActionRef.current = pendingAction;
    onPendingActionConsumed?.();
    handleNewTemplate();
  }, [pendingAction, loading, onPendingActionConsumed]);

  const handleTemplateUpdate = async (updatedTemplate: Template) => {
    try {
      await TemplateService.saveTemplate(updatedTemplate);
      setSelectedTemplate(updatedTemplate);

      // Refresh the list
      await loadTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  };

  const handleBackToList = () => {
    setViewState("list");
    setSelectedTemplate(null);
  };

  const handleCloneTemplate = async (template: Template) => {
    try {
      const clonedTemplate: Template = {
        ...template,
        id: crypto.randomUUID(),
        title: `${template.title} Copy`,
        user_id: userId,
      };
      await dbCommands.upsertTemplate(clonedTemplate);
      await loadTemplates();
    } catch (error) {
      console.error("Failed to clone template:", error);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    try {
      await TemplateService.deleteTemplate(template.id);
      await loadTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const handleToggleFavorite = async (template: Template) => {
    try {
      const isFavorite = favoriteTemplateIds.has(template.id);
      const newFavoriteStatus = !isFavorite;

      // Optimistic update
      setFavoriteTemplateIds(prev => {
        const newSet = new Set(prev);
        if (newFavoriteStatus) {
          newSet.add(template.id);
        } else {
          newSet.delete(template.id);
        }
        return newSet;
      });

      // Optimistic update for popover cache
      queryClient.setQueryData(["templates", "popover"], (oldData: Template[] | undefined) => {
        if (!oldData) {
          return oldData;
        }

        if (newFavoriteStatus) {
          // Adding to favorites - add template to popover if not already there
          const isAlreadyInPopover = oldData.some(t => t.id === template.id);
          if (!isAlreadyInPopover) {
            return [...oldData, template];
          }
          return oldData;
        } else {
          // Removing from favorites - remove from popover
          const filteredData = oldData.filter(t => t.id !== template.id);

          // If no favorites left, show default 4 templates
          if (filteredData.length === 0) {
            const defaultIds = [
              "default-meeting-notes",
              "default-standup",
              "default-one-on-one",
              "default-b2b-discovery",
            ];
            return [...customTemplates, ...builtinTemplates].filter(t => defaultIds.includes(t.id));
          }

          return filteredData;
        }
      });

      // Update the database
      await TemplateService.toggleTemplateFavorite(template.id, newFavoriteStatus);

      // Invalidate to ensure consistency (but UI already updated optimistically)
      queryClient.invalidateQueries({ queryKey: ["templates", "popover"] });
    } catch (error) {
      console.error("Failed to toggle template favorite:", error);
      // Revert optimistic update on error
      await loadTemplates();
    }
  };

  // Get currently selected template ID from config
  const selectedTemplateId = config.data?.selected_template_id;

  // Debug: Keep minimal logging
  console.log("🔍 Templates view selectedTemplateId:", selectedTemplateId);

  // Add handler for template deletion from editor
  const handleTemplateDeleteFromEditor = async () => {
    if (selectedTemplate) {
      try {
        await dbCommands.deleteTemplate(selectedTemplate.id);
        await loadTemplates();
        handleBackToList(); // Go back to list after deletion
      } catch (error) {
        console.error("Failed to delete template:", error);
      }
    }
  };

  // Check if current template is being viewed (read-only)
  const isViewingTemplate = selectedTemplate && !TemplateService.canEditTemplate(selectedTemplate.id);

  // Show template editor
  if (viewState === "editor" || viewState === "new") {
    return (
      <div>
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToList}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <i className="ri-arrow-left-line" />
            {isViewingTemplate ? <Trans>Back</Trans> : <Trans>Save and close</Trans>}
          </Button>
        </div>

        {selectedTemplate && (
          <TemplateEditor
            disabled={false}
            template={selectedTemplate}
            onTemplateUpdate={handleTemplateUpdate}
            onDelete={handleTemplateDeleteFromEditor}
            isCreator={true}
          />
        )}
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-32 space-y-2">
        <i className="ri-loader-4-line h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <Trans>Loading templates...</Trans>
        </p>
      </div>
    );
  }

  // Show template list
  return (
    <TooltipProvider>
      <div>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                <Trans>Your templates</Trans>
              </div>
              <div className="text-xs text-muted-foreground">
                <Trans>Create custom templates and pin them for quick access in your editor dock</Trans>
              </div>
            </div>

            <Button
              onClick={handleNewTemplate}
              variant="outline"
              size="sm"
            >
              <i className="ri-add-line" />
            </Button>
          </div>

          {/* Templates */}
          <div className="space-y-2">
            {customTemplates.length > 0
              ? (
                customTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={() => handleTemplateSelect(template)}
                    onEdit={() => handleTemplateEdit(template)}
                    onClone={() => handleCloneTemplate(template)}
                    onDelete={() => handleDeleteTemplate(template)}
                    isSelected={template.id === selectedTemplateId}
                    isFavorite={favoriteTemplateIds.has(template.id)}
                    onToggleFavorite={() => handleToggleFavorite(template)}
                  />
                ))
              )
              : (
                <div className="flex flex-col items-center justify-center py-8 px-6 text-center bg-muted/50 border border rounded-lg">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    <Trans>No templates yet</Trans>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Trans>Create your first template to get started</Trans>
                  </div>
                </div>
              )}
          </div>

          {/* Built-in Templates */}
          {builtinTemplates.length > 0 && (
            <div>
              <div className="space-y-2 mb-4">
                <div className="text-sm font-medium">
                  <Trans>Built-in templates</Trans>
                </div>
                <div className="text-xs text-muted-foreground">
                  <Trans>Pin a template to access it directly from the AI summary dock in your editor</Trans>
                </div>
              </div>
              <div className="space-y-2">
                {builtinTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={() => handleTemplateSelect(template)}
                    onEdit={() => handleTemplateEdit(template)}
                    onClone={() => handleCloneTemplate(template)}
                    onDelete={() => handleDeleteTemplate(template)}
                    isSelected={template.id === selectedTemplateId}
                    isFavorite={favoriteTemplateIds.has(template.id)}
                    onToggleFavorite={() => handleToggleFavorite(template)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Auto mode hint */}
          {!selectedTemplateId && (
            <p className="text-xs text-muted-foreground text-center">
              <Trans>
                No default template selected. Auto mode lets the AI structure your notes freely, which works great for
                most use cases.
              </Trans>
            </p>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// Template Card Component with separate select/edit actions
interface TemplateCardProps {
  template: Template;
  onSelect: () => void;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

function TemplateCard(
  { template, onSelect, onEdit, onClone, onDelete, isSelected, isFavorite, onToggleFavorite }: TemplateCardProps,
) {
  const { t } = useLingui();

  // Get translated template title and description for built-in templates
  const getTemplateTitle = (template: Template) => {
    if (!isDefaultTemplate(template.id)) {
      return template.title || t`Untitled Template`;
    }

    switch (template.id) {
      case "default-meeting-notes":
        return t`Meeting Notes`;
      case "default-one-on-one":
        return t`1-on-1 Meeting`;
      case "default-customer-call":
        return t`Customer Call`;
      case "default-job-interview":
        return t`Interview Debrief`;
      case "default-project-planning":
        return t`Project Kickoff`;
      default:
        return template.title || t`Untitled Template`;
    }
  };

  const getTemplateDescription = (template: Template) => {
    if (!isDefaultTemplate(template.id)) {
      return template.description || t`Create and customize your meeting notes`;
    }

    switch (template.id) {
      case "default-meeting-notes":
        return t`General-purpose template for meeting notes with agenda, discussion points, and action items`;
      case "default-one-on-one":
        return t`Template for recurring one-on-one meetings between a manager and direct report`;
      case "default-customer-call":
        return t`Template for customer calls, discovery sessions, and sales conversations`;
      case "default-job-interview":
        return t`Structured candidate assessment from interview conversations`;
      case "default-project-planning":
        return t`Template for project kickoffs, planning sessions, and requirement discussions`;
      default:
        return template.description || t`Create and customize your meeting notes`;
    }
  };
  const handleCardClick = () => {
    onEdit?.();
  };

  const handleSetDefaultClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
  };

  // Function to truncate text
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength).trim() + "...";
  };

  return (
    <div
      className={cn(
        "p-4 rounded-lg transition-all duration-200 ease-in-out cursor-pointer flex flex-col gap-2",
        isSelected
          ? "border-2 border-primary/30 bg-primary/5 shadow-sm ring-1 ring-primary/15"
          : "border border bg-background hover:border hover:shadow-sm",
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="text-base group-hover:scale-110 transition-transform duration-200">
            <TemplateIcon template={template} className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="font-medium text-sm truncate">
                {truncateText(getTemplateDisplayName(getTemplateTitle(template), t`Untitled Template`), 30)}
              </div>
            </div>
            <p className="text-xs font-normal text-muted-foreground mt-1 truncate">
              {truncateText(getTemplateDescription(template), 50)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pin quick access button */}
          {onToggleFavorite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                  }}
                  className="p-1 h-8 w-8 text-muted-foreground/70 hover:text-primary transition-all duration-200 hover:scale-110"
                >
                  <i className={isFavorite ? "ri-pushpin-fill text-primary" : "ri-pushpin-line"} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFavorite ? t`Remove from quick access` : t`Add to quick access in editor`}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={handleSetDefaultClick}
            className={cn(
              "text-xs px-2 py-1 h-auto flex items-center gap-1 min-w-[96px] transition-all duration-200",
              isSelected
                ? "bg-primary hover:bg-primary/90 text-primary-foreground border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isSelected && <i className="ri-check-line text-xs" />}
            {isSelected ? t`Default` : t`Set as default`}
          </Button>
        </div>
      </div>
    </div>
  );
}
