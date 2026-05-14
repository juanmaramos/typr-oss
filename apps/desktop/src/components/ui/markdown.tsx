import { cn } from "@/lib/utils";
import { parseCitations } from "@typr/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { marked } from "marked";
import { memo, useId, useMemo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CodeBlock, CodeBlockCode } from "./code-block";
import { Sources } from "./sources";

export type MarkdownProps = {
  children: string;
  id?: string;
  className?: string;
  components?: Partial<Components>;
  sources?: Array<{ url: string; title?: string }>; // Source URLs cited in the message
};

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

function extractLanguage(className?: string): string {
  if (!className) {
    return "plaintext";
  }
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "plaintext";
}

const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline = !props.node?.position?.start.line
      || props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-primary-foreground rounded-sm px-1 font-mono text-sm",
            className,
          )}
          {...props}
        >
          {children}
        </span>
      );
    }

    const language = extractLanguage(className);

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    );
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
  a: function LinkComponent({ href, children, ...props }) {
    const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (href) {
        try {
          // Use opener plugin to open URLs in default browser
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open link:", error);
        }
      }
    };

    return (
      <a
        href={href}
        onClick={handleClick}
        className="text-primary hover:underline cursor-pointer"
        {...props}
      >
        {children}
      </a>
    );
  },
};

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string;
    components?: Partial<Components>;
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    );
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content;
  },
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

function MarkdownComponent({
  children,
  id,
  className,
  components,
  sources,
}: MarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const mergedComponents = useMemo(
    () => ({ ...INITIAL_COMPONENTS, ...components }),
    [components],
  );

  // KISS: Just parse and remove Groq citations completely
  const { text: cleanText, citations } = useMemo(() => {
    const result = parseCitations(children);
    // Remove [1], [2] markers - keep text clean
    const finalText = result.text.replace(/\[\d+\]/g, "");
    return { text: finalText, citations: result.citations };
  }, [children]);

  const blocks = useMemo(() => parseMarkdownIntoBlocks(cleanText), [cleanText]);

  // Extract source URL from message or use provided sources
  const displaySources = useMemo(() => {
    if (sources && sources.length > 0) {
      return sources;
    }

    // Fallback: extract URL from original message content
    const urlMatch = children.match(/https?:\/\/[^\s]+/);
    if (urlMatch && citations.length > 0) {
      return [{ url: urlMatch[0] }];
    }
    return [];
  }, [sources, children, citations]);

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={mergedComponents}
        />
      ))}

      {/* Show sources at bottom if citations were found */}
      {displaySources.length > 0 && <Sources sources={displaySources} />}
    </div>
  );
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = "Markdown";

export { Markdown };
