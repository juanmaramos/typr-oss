import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { useLingui } from "@lingui/react/macro";

export interface CitationSource {
  number: number;
  title: string;
  url: string;
  snippet?: string;
}

export function InlineCitation({ source }: { source: CitationSource }) {
  const { t } = useLingui();

  // Safe URL parsing with fallback
  let hostname = "unknown";
  try {
    hostname = new URL(source.url).hostname.replace(/^www\./, "");
  } catch (e) {
    console.warn("Invalid citation URL:", source.url);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="ml-0.5 size-5 rounded bg-primary/10 p-0 text-[10px] font-medium text-primary hover:bg-primary/20 hover:text-primary"
          aria-label={t`View source ${source.number}`}
          type="button"
        >
          {source.number}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 bg-background p-3"
        sideOffset={5}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium line-clamp-2">{source.title}</h4>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 break-all"
          >
            <i className="ri-external-link-line flex-shrink-0" />
            <span className="break-all">{hostname}</span>
          </a>
          {source.snippet && (
            <p className="text-xs text-muted-foreground border-l-2 border-primary/20 pl-2 italic">
              {source.snippet}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
