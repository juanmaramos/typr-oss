import { cn } from "@/lib/utils";
import * as React from "react";
import { Markdown } from "./markdown";

export type MessageProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

const Message = ({ children, className, ...props }: MessageProps) => (
  <div className={cn("flex flex-col gap-2 group relative select-text", className)} {...props}>
    {children}
  </div>
);

export type MessageContentProps = {
  children: React.ReactNode;
  markdown?: boolean;
  messageId?: string;
  className?: string;
  sources?: Array<{ url: string; title?: string }>; // Source URLs for citations
} & Omit<React.HTMLProps<HTMLDivElement>, "children">;

const MessageContent = ({
  children,
  markdown = false,
  messageId,
  className,
  sources,
  ...props
}: MessageContentProps) => {
  const classNames = cn(
    "rounded-lg prose prose-sm text-sm break-words whitespace-normal user-select-text max-w-none",
    // Use your app's color system instead of prose-neutral defaults
    "prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground",
    "prose-strong:text-foreground prose-em:text-foreground",
    "prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
    "prose-pre:bg-muted prose-pre:text-foreground",
    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
    "prose-blockquote:text-muted-foreground prose-blockquote:border-border",
    // Scale down headers for chat context
    "prose-h1:text-lg prose-h1:font-semibold prose-h1:my-2 prose-h1:leading-tight",
    "prose-h2:text-base prose-h2:font-semibold prose-h2:my-1.5 prose-h2:leading-tight",
    "prose-h3:text-sm prose-h3:font-medium prose-h3:my-1 prose-h3:leading-tight",
    "prose-h4:text-sm prose-h4:font-normal prose-h4:my-1 prose-h4:leading-tight",
    className,
  );

  return markdown
    ? (
      <Markdown
        id={messageId}
        className={classNames}
        sources={sources}
      >
        {typeof children === "string" ? children : String(children)}
      </Markdown>
    )
    : (
      <div className={classNames} {...props}>
        {children}
      </div>
    );
};

export { MessageAction, MessageActions } from "./message-action";
export { Message, MessageContent };
