import { MessagePart } from "../components/chat/types";

export const parseMarkdownBlocks = (text: string): MessagePart[] => {
  const parts: MessagePart[] = [];
  let currentIndex = 0;
  let inMarkdownBlock = false;
  let markdownStart = -1;

  // First, try to parse any explicit code blocks (with triple backticks)
  for (let i = 0; i < text.length - 2; i++) {
    if (text.slice(i, i + 3) === "```") {
      if (!inMarkdownBlock) {
        // Starting a markdown block
        if (i > currentIndex) {
          // Add text before markdown as markdown too (not as plain text)
          const textContent = text.slice(currentIndex, i).trim();
          if (textContent) {
            parts.push({
              type: "markdown",
              content: textContent,
              isComplete: true,
            });
          }
        }
        markdownStart = i + 3;
        inMarkdownBlock = true;
        i += 2; // Skip the ```
      } else {
        // Ending a markdown block
        const markdownContent = text.slice(markdownStart, i);
        parts.push({
          type: "markdown",
          content: markdownContent,
          isComplete: true,
        });
        inMarkdownBlock = false;
        currentIndex = i + 3;
        i += 2; // Skip the ```
      }
    }
  }

  // Handle remaining content
  if (inMarkdownBlock) {
    // Incomplete markdown block
    const markdownContent = text.slice(markdownStart);
    parts.push({
      type: "markdown",
      content: markdownContent,
      isComplete: false,
    });
  } else if (currentIndex < text.length) {
    // Treat any remaining text as markdown too
    const remainingText = text.slice(currentIndex).trim();
    if (remainingText) {
      parts.push({
        type: "markdown", // Changed from "text" to "markdown"
        content: remainingText,
        isComplete: true,
      });
    }
  }

  return parts;
};
