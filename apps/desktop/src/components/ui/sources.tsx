import { cn } from "@/lib/utils";
import { useLingui } from "@lingui/react/macro";
import * as Collapsible from "@radix-ui/react-collapsible";
import { openUrl } from "@tauri-apps/plugin-opener";

interface SourcesProps {
  sources: Array<{ url: string; title?: string }>;
  className?: string;
}

export function Sources({ sources, className }: SourcesProps) {
  const { t } = useLingui();

  if (!sources || sources.length === 0) {
    return null;
  }

  // Translatable string with pluralization (using template literal syntax)
  const sourcesLabel = sources.length === 1
    ? t`Used ${sources.length} source`
    : t`Used ${sources.length} sources`;

  return (
    <Collapsible.Root className={cn("mt-4 border-t pt-3", className)}>
      <Collapsible.Trigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group">
        <i className="ri-arrow-right-s-line text-base transition-transform group-data-[state=open]:rotate-90" />
        <span>{sourcesLabel}</span>
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <div className="flex flex-col gap-1.5 pt-2 pl-6">
          {sources.map((source, index) => {
            let hostname = source.title || source.url;
            try {
              hostname = source.title || new URL(source.url).hostname.replace(/^www\./, "");
            } catch (e) {
              // Use title or full URL if parsing fails
            }

            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault();
              openUrl(source.url).catch(err => console.error("Failed to open source:", err));
            };

            return (
              <a
                key={index}
                href={source.url}
                onClick={handleClick}
                className="flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer group py-0.5"
              >
                <i className="ri-external-link-line text-sm mt-0.5 flex-shrink-0" />
                <span className="line-clamp-1 group-hover:underline">{hostname}</span>
              </a>
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
