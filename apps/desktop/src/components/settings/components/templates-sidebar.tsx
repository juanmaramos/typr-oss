import { Trans, useLingui } from "@lingui/react/macro";

import { TemplateIcon } from "@/components/ui/template-icon";
import { isDefaultTemplate } from "@/utils/default-templates";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { type Template } from "@typr/plugin-db";
import { cn } from "@typr/ui/lib/utils";

interface TemplatesSidebarProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  customTemplates: Template[];
  builtinTemplates: Template[];
  selectedTemplate: string | null;
  onTemplateSelect: (templateId: string) => void;
}

export function TemplatesSidebar({
  searchQuery,
  onSearchChange,
  customTemplates,
  builtinTemplates,
  selectedTemplate,
  onTemplateSelect,
}: TemplatesSidebarProps) {
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
  const { t } = useLingui();

  return (
    <>
      <div className="p-2">
        <div className="relative flex items-center">
          <i className="ri-search-line absolute left-2 h-4 w-4 text-muted-foreground/70" />
          <input
            type="text"
            placeholder={t`Search templates...`}
            className="w-full rounded-md border border bg-background py-1 pl-8 pr-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-muted-foreground"
            value={searchQuery}
            onChange={onSearchChange}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-2">
          {customTemplates.length > 0 && (
            <div>
              <h3 className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">
                <Trans>Your Templates</Trans>
              </h3>
              <div className="space-y-1">
                {customTemplates.map((template) => (
                  <button
                    key={template.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg p-2 text-sm text-muted-foreground hover:bg-surface-400",
                      selectedTemplate === template.id && "bg-muted font-medium",
                    )}
                    onClick={() => onTemplateSelect(template.id)}
                  >
                    <TemplateIcon template={template} className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span>{getTemplateDisplayName(getTemplateTitle(template), t`Untitled Template`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {builtinTemplates.length > 0 && (
            <div>
              <h3 className="mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">
                <Trans>Built-in Templates</Trans>
              </h3>
              <div className="space-y-1">
                {builtinTemplates.map((template) => (
                  <button
                    key={template.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg p-2 text-sm text-muted-foreground hover:bg-surface-400",
                      selectedTemplate === template.id && "bg-muted font-medium",
                    )}
                    onClick={() => onTemplateSelect(template.id)}
                  >
                    <TemplateIcon template={template} className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <span>{getTemplateDisplayName(getTemplateTitle(template), t`Untitled Template`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
