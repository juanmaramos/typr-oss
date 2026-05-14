import {
  type ProjectCitationSource,
  ProjectSourceCitationMarkdown,
} from "@/components/projects/project-source-citation-markdown";
import type { ProjectBriefSource } from "@typr/plugin-db";
import { useMemo } from "react";

interface ProjectBriefMarkdownProps {
  className?: string;
  markdown: string;
  onOpenSource: (source: ProjectBriefSource) => void;
  sources: ProjectBriefSource[];
}

export function ProjectBriefMarkdown({
  className,
  markdown,
  onOpenSource,
  sources,
}: ProjectBriefMarkdownProps) {
  const sourceByCitationSource = useMemo(() => {
    const sourceMap = new Map<ProjectCitationSource, ProjectBriefSource>();
    const citationSources = sources.map((source) => {
      const citationSource: ProjectCitationSource = {
        key: source.source_key,
        sourceId: source.source_id,
        title: source.title,
        type: source.source_type === "file" ? "file" : "note",
      };

      sourceMap.set(citationSource, source);
      return citationSource;
    });

    return { citationSources, sourceMap };
  }, [sources]);

  return (
    <ProjectSourceCitationMarkdown
      className={className}
      markdown={markdown}
      sources={sourceByCitationSource.citationSources}
      onOpenSource={source => {
        const briefSource = sourceByCitationSource.sourceMap.get(source);
        if (briefSource) {
          onOpenSource(briefSource);
        }
      }}
    />
  );
}
