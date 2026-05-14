import { Markdown } from "@/components/ui/markdown";
import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useMemo } from "react";

const PROJECT_SOURCE_CITATION_HREF_PREFIX = "#project-source:";
const PROJECT_SOURCE_CITATION_PATTERN = /\[((?:[SF]\d+)(?:\s*,\s*[SF]\d+)*)\]/g;

export interface ProjectCitationSource {
  key: string;
  sourceId: string;
  title: string;
  type: "note" | "file";
}

export function hasProjectSourceCitations(markdown: string, sources: ProjectCitationSource[]) {
  const sourceKeys = new Set(sources.map(source => source.key));
  let match: RegExpExecArray | null;

  PROJECT_SOURCE_CITATION_PATTERN.lastIndex = 0;
  while ((match = PROJECT_SOURCE_CITATION_PATTERN.exec(markdown)) !== null) {
    const keys = match[1].split(",").map(key => key.trim()).filter(Boolean);
    if (keys.some(key => sourceKeys.has(key))) {
      return true;
    }
  }

  return false;
}

interface ProjectSourceCitationMarkdownProps {
  className?: string;
  markdown: string;
  onOpenSource: (source: ProjectCitationSource) => void;
  sources: ProjectCitationSource[];
}

export function ProjectSourceCitationMarkdown({
  className,
  markdown,
  onOpenSource,
  sources,
}: ProjectSourceCitationMarkdownProps) {
  const sourceByKey = useMemo(
    () => new Map(sources.map(source => [source.key, source])),
    [sources],
  );
  const markdownComponents = useMemo(
    () => ({
      a: ({ children, href }: { children?: ReactNode; href?: string }) => {
        const citationKeys = parseProjectSourceCitationHref(href);
        if (!citationKeys) {
          return (
            <a href={href} className="text-primary hover:underline">
              {children}
            </a>
          );
        }

        const citationSources = citationKeys
          .map(key => sourceByKey.get(key))
          .filter((source): source is ProjectCitationSource => Boolean(source));

        if (citationSources.length === 0) {
          return <span>{children}</span>;
        }

        return (
          <ProjectSourceCitation
            sources={citationSources}
            onOpenSource={onOpenSource}
          />
        );
      },
    }),
    [onOpenSource, sourceByKey],
  );

  return (
    <Markdown
      className={className}
      components={markdownComponents}
    >
      {linkProjectSourceCitations(markdown, sourceByKey)}
    </Markdown>
  );
}

function linkProjectSourceCitations(markdown: string, sourceByKey: Map<string, ProjectCitationSource>) {
  return markdown.replace(PROJECT_SOURCE_CITATION_PATTERN, (match, rawKeys: string) => {
    const keys = rawKeys.split(",").map(key => key.trim()).filter(Boolean);
    if (!keys.some(key => sourceByKey.has(key))) {
      return match;
    }

    return `[${keys.join(", ")}](${PROJECT_SOURCE_CITATION_HREF_PREFIX}${keys.join(",")})`;
  });
}

function parseProjectSourceCitationHref(href: string | undefined) {
  if (!href?.startsWith(PROJECT_SOURCE_CITATION_HREF_PREFIX)) {
    return null;
  }

  return href
    .slice(PROJECT_SOURCE_CITATION_HREF_PREFIX.length)
    .split(",")
    .map(key => key.trim())
    .filter(Boolean);
}

function ProjectSourceCitation({
  onOpenSource,
  sources,
}: {
  onOpenSource: (source: ProjectCitationSource) => void;
  sources: ProjectCitationSource[];
}) {
  const { t } = useLingui();
  const firstSource = sources[0];
  const label = sources.length === 1 ? firstSource.title : `${firstSource.title} +${sources.length - 1}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mx-0.5 h-5 max-w-[12rem] translate-y-[2px] gap-1 border-border bg-muted px-1.5 text-[11px] font-medium leading-none text-foreground hover:border-foreground/20 hover:bg-muted/80"
          aria-label={t`View source ${label}`}
        >
          <i
            className={cn(
              "shrink-0 text-[11px]",
              firstSource.type === "file" ? "ri-file-text-line" : "ri-article-line",
            )}
          />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 border bg-background p-0 shadow-lg">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          {sources.length === 1 ? <Trans>Source</Trans> : <Trans>{sources.length} sources</Trans>}
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {sources.map(source => (
            <Button
              key={`${source.key}-${source.sourceId}`}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-left whitespace-normal hover:bg-muted"
              onClick={() => onOpenSource(source)}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <i className={source.type === "file" ? "ri-file-text-line" : "ri-article-line"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{source.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {source.key} · {source.type === "file" ? <Trans>File</Trans> : <Trans>Note</Trans>}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
