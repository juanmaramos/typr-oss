import { cn } from "@/lib/utils";
import * as React from "react";

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children: React.ReactNode;
}

export function CodeBlock({
  className,
  children,
  ...props
}: CodeBlockProps) {
  return (
    <pre className={cn("rounded-md overflow-auto p-4 bg-muted", className)} {...props}>
      {children}
    </pre>
  );
}

interface CodeBlockCodeProps extends React.HTMLAttributes<HTMLElement> {
  code: string;
  language?: string;
}

export function CodeBlockCode({
  code,
  language = "plaintext",
  className,
  ...props
}: CodeBlockCodeProps) {
  return (
    <code className={cn("text-sm font-mono", className)} {...props}>
      {code}
    </code>
  );
}
