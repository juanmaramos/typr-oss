import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import { type ReactNode } from "react";

import { TemplateIcon } from "@/components/ui/template-icon";
import { isDefaultTemplate } from "@/utils/default-templates";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { type Template } from "@typr/plugin-db";
import { cn } from "@typr/ui/lib/utils";

interface TemplateListProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  customTemplates: Template[];
  builtinTemplates: Template[];
  onTemplateSelect: (template: Template) => void;
  selectedTemplate: Template | null;
}

export function TemplateList({
  searchQuery,
  onSearchChange,
  customTemplates,
  builtinTemplates,
  onTemplateSelect,
  selectedTemplate,
}: TemplateListProps) {
  const { t } = useLingui();

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

  const filterTemplate = (template: Template, query: string) => {
    const searchLower = query.toLowerCase();
    return (
      template.title?.toLowerCase().includes(searchLower)
      || template.description?.toLowerCase().includes(searchLower)
      || template.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="bg-background p-2">
        <div className="relative">
          <i className="ri-search-line absolute left-2 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <input
            placeholder={t`Search templates...`}
            className="w-full bg-transparent px-8 py-2 text-sm text-foreground focus:outline-none"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        {customTemplates && customTemplates.length > 0 && (
          <section className="p-2">
            <h3 className="flex items-center gap-2 p-2 text-sm font-semibold text-foreground/80">
              <i className="ri-heart-line h-4 w-4" />
              <Trans>My Templates</Trans>
            </h3>
            <nav className="mt-2 rounded-md bg-muted/50 p-2">
              <ul>
                {customTemplates
                  .filter((template) => filterTemplate(template, searchQuery))
                  .map((template) => (
                    <li key={template.id}>
                      <button
                        onClick={() => onTemplateSelect(template)}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-lg p-2 text-sm text-muted-foreground",
                          selectedTemplate?.id === template.id
                            ? "bg-surface-400 font-medium text-foreground"
                            : "hover:bg-surface-400",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <TemplateIcon
                            template={template}
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              selectedTemplate?.id === template.id ? "text-foreground" : "text-muted-foreground",
                            )}
                          />
                          <span>{getTemplateDisplayName(getTemplateTitle(template), t`Untitled Template`)}</span>
                        </span>
                        {template.tags && template.tags.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <i className="ri-price-tag-3-line h-3 w-3" />
                            <span>{template.tags.join(", ")}</span>
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </nav>
          </section>
        )}

        <section className="p-2">
          <h3 className="flex items-center gap-2 p-2 text-sm font-semibold text-foreground/80">
            <i className="ri-flashlight-line text-base" />
            <Trans>Official Templates</Trans>
          </h3>
          <nav className="mt-2 rounded-md bg-muted/50 p-2">
            <ul>
              {builtinTemplates
                .filter((template) => filterTemplate(template, searchQuery))
                .map((template) => (
                  <li key={template.id}>
                    <button
                      onClick={() => onTemplateSelect(template)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-lg p-2 text-sm text-muted-foreground",
                        selectedTemplate?.id === template.id
                          ? "bg-surface-400 font-medium text-foreground"
                          : "hover:bg-surface-400",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <TemplateIcon
                          template={template}
                          className={cn(
                            "h-4 w-4 flex-shrink-0",
                            selectedTemplate?.id === template.id ? "text-foreground" : "text-muted-foreground",
                          )}
                        />
                        <span>{getTemplateDisplayName(getTemplateTitle(template), t`Untitled Template`)}</span>
                      </span>
                      {template.tags && template.tags.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <i className="ri-price-tag-3-line h-3 w-3" />
                          <span>{template.tags.join(", ")}</span>
                        </div>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          </nav>
        </section>
      </div>
    </div>
  );
}

interface TemplateContentProps {
  children: ReactNode;
}

export function TemplateContent({ children }: TemplateContentProps) {
  return <div className="flex-1 overflow-y-auto p-6">{children}</div>;
}
