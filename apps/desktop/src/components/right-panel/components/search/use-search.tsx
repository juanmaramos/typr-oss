import { useCallback, useEffect, useRef, useState } from "react";

// Define the type of search target
export type SearchTarget =
  | { type: "editor"; editorRef: React.RefObject<any> } // For TipTap editor (transcript)
  | { type: "dom"; selector: string }; // For DOM elements (chat)

interface UseSearchProps {
  target: SearchTarget;
  onClose: () => void;
  hasReplace?: boolean;
}

export function useSearch({ target, onClose, hasReplace = false }: UseSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [resultCount, setResultCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<number[]>([]);

  // For DOM-based searches
  const elementsContainerRef = useRef<HTMLElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Initialize style for DOM-based highlighting
  useEffect(() => {
    if (target.type === "dom") {
      const style = document.createElement("style");
      style.textContent = `
        .search-highlight {
          background-color: hsl(var(--highlight)) !important;
          border-radius: 0.125rem !important;
          padding: 0 0.125rem !important;
        }
        .search-highlight-current {
          background-color: hsl(var(--highlight-current)) !important;
        }
      `;
      document.head.appendChild(style);
      styleRef.current = style;

      // Find container for DOM search
      setTimeout(() => {
        elementsContainerRef.current = document.querySelector(target.selector);
      }, 0);
    }

    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
      }
      clearResults();
    };
  }, [target]);

  // Handle search term changes
  useEffect(() => {
    if (target.type === "editor") {
      // Editor-based search (TipTap)
      const editorRef = target.editorRef;
      if (!searchTerm.trim() || !editorRef.current) {
        clearResults();
        return;
      }

      const debouncedSearch = setTimeout(() => {
        editorRef.current.editor.commands.setSearchTerm(searchTerm);
        editorRef.current.editor.commands.resetIndex();

        const storage = editorRef.current.editor.storage.searchAndReplace;
        const results = storage.results || [];
        setResultCount(results.length);
        setCurrentIndex(results.length > 0 ? (storage.resultIndex ?? 0) + 1 : 0);
      }, 300);

      return () => clearTimeout(debouncedSearch);
    } else {
      // DOM-based search
      if (!searchTerm.trim()) {
        clearResults();
        return;
      }

      const debouncedSearch = setTimeout(() => {
        performDomSearch();
      }, 300);

      return () => clearTimeout(debouncedSearch);
    }
  }, [searchTerm, target]);

  // Handle replace term changes (for editor only)
  useEffect(() => {
    if (target.type === "editor" && target.editorRef.current) {
      target.editorRef.current.editor.commands.setReplaceTerm(replaceTerm);
    }
  }, [replaceTerm, target]);

  const clearResults = useCallback(() => {
    setResults([]);
    setResultCount(0);
    setCurrentIndex(0);

    if (target.type === "dom") {
      // Clear DOM highlights
      const highlightedElements = document.querySelectorAll(".search-highlight");
      highlightedElements.forEach(el => {
        const parent = el.parentElement;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ""), el);
          parent.normalize();
        }
      });

      // Remove current highlight class
      const currentHighlight = document.querySelector(".search-highlight-current");
      if (currentHighlight) {
        currentHighlight.classList.remove("search-highlight-current");
      }
    }
  }, [target]);

  const performDomSearch = useCallback(() => {
    if (!searchTerm.trim() || target.type !== "dom") {
      return;
    }

    // Re-query the container to ensure it's available
    if (!elementsContainerRef.current) {
      elementsContainerRef.current = document.querySelector(target.selector);
      if (!elementsContainerRef.current) {
        console.warn("Search container not found:", target.selector);
        return;
      }
    }

    // Clear previous results
    clearResults();

    // Get all elements to search
    const contentElements = document.querySelectorAll(".whitespace-pre-wrap");
    const foundResults: number[] = [];

    contentElements.forEach((el, idx) => {
      const text = el.textContent || "";
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escapedSearchTerm, "gi");

      if (searchRegex.test(text)) {
        // Add this element to results
        foundResults.push(idx);

        // Create a temporary container
        const tempDiv = document.createElement("div");
        tempDiv.textContent = text;

        // Use DOM methods to safely create the highlighted content
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        // Create a regex that must be reset each time
        const matchRegex = new RegExp(escapedSearchTerm, "gi");

        while ((match = matchRegex.exec(text)) !== null) {
          // Add text before the match
          if (match.index > lastIndex) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex, match.index)),
            );
          }

          // Add the highlighted match
          const highlightSpan = document.createElement("span");
          highlightSpan.className = "search-highlight";
          highlightSpan.textContent = match[0]; // The exact match text
          fragment.appendChild(highlightSpan);

          lastIndex = matchRegex.lastIndex;
        }

        // Add any text after the last match
        if (lastIndex < text.length) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex)),
          );
        }

        // Clear the element and add our fragment
        el.textContent = "";
        el.appendChild(fragment);
      }
    });

    setResults(foundResults);
    setResultCount(foundResults.length);

    if (foundResults.length > 0) {
      setCurrentIndex(1);
      highlightCurrentDomResult(0);
    }
  }, [searchTerm, target, clearResults]);

  const highlightCurrentDomResult = useCallback((index: number) => {
    if (target.type !== "dom") {
      return;
    }

    // Remove previous current highlight
    const prevHighlight = document.querySelector(".search-highlight-current");
    if (prevHighlight) {
      prevHighlight.classList.remove("search-highlight-current");
    }

    // Find all content elements and highlights
    const contentElements = document.querySelectorAll(".whitespace-pre-wrap");
    const elementIndex = results[index];
    const element = contentElements[elementIndex];

    if (element) {
      // Find all highlights in this element
      const highlights = element.querySelectorAll(".search-highlight");
      if (highlights.length > 0) {
        // For now, mark the first occurrence as current
        // In a future enhancement, we could track which occurrence within the element to highlight
        const highlight = highlights[0];
        highlight.classList.add("search-highlight-current");

        // Ensure the highlighted element is visible
        setTimeout(() => {
          highlight.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 50);
      }
    }
  }, [results, target]);

  const scrollCurrentResultIntoView = useCallback((editorRef: React.RefObject<any>) => {
    if (!editorRef.current) {
      return;
    }

    const editorElement = editorRef.current.editor.view.dom;
    const current = editorElement.querySelector(".search-result-current");
    if (current) {
      current.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, []);

  const handleNext = useCallback(() => {
    if (target.type === "editor") {
      // Editor-based next
      const editorRef = target.editorRef;
      if (editorRef.current?.editor) {
        editorRef.current.editor.commands.nextSearchResult();
        setTimeout(() => {
          const storage = editorRef.current.editor.storage.searchAndReplace;
          setCurrentIndex((storage.resultIndex ?? 0) + 1);
          scrollCurrentResultIntoView(editorRef);
        }, 100);
      }
    } else {
      // DOM-based next
      if (results.length === 0) {
        return;
      }

      let nextIndex = currentIndex % results.length;
      setCurrentIndex(nextIndex + 1);
      highlightCurrentDomResult(nextIndex);
    }
  }, [target, results, currentIndex, scrollCurrentResultIntoView, highlightCurrentDomResult]);

  const handlePrevious = useCallback(() => {
    if (target.type === "editor") {
      // Editor-based previous
      const editorRef = target.editorRef;
      if (editorRef.current?.editor) {
        editorRef.current.editor.commands.previousSearchResult();
        setTimeout(() => {
          const storage = editorRef.current.editor.storage.searchAndReplace;
          setCurrentIndex((storage.resultIndex ?? 0) + 1);
          scrollCurrentResultIntoView(editorRef);
        }, 100);
      }
    } else {
      // DOM-based previous
      if (results.length === 0) {
        return;
      }

      let prevIndex = currentIndex - 2;
      if (prevIndex < 0) {
        prevIndex = results.length - 1;
      }

      setCurrentIndex(prevIndex + 1);
      highlightCurrentDomResult(prevIndex);
    }
  }, [target, results, currentIndex, scrollCurrentResultIntoView, highlightCurrentDomResult]);

  const handleReplaceAll = useCallback(() => {
    if (target.type === "editor" && target.editorRef.current && searchTerm) {
      target.editorRef.current.editor.commands.replaceAll();
      setTimeout(() => {
        const storage = target.editorRef.current.editor.storage.searchAndReplace;
        const results = storage.results || [];
        setResultCount(results.length);
        setCurrentIndex(results.length > 0 ? 1 : 0);
      }, 100);
    }
  }, [target, searchTerm]);

  const handleClose = useCallback(() => {
    if (target.type === "editor" && target.editorRef.current) {
      target.editorRef.current.editor.commands.setSearchTerm("");
    }
    clearResults();
    onClose();
  }, [target, clearResults, onClose]);

  return {
    searchTerm,
    setSearchTerm,
    replaceTerm,
    setReplaceTerm,
    resultCount,
    currentIndex,
    results,
    handleNext,
    handlePrevious,
    handleReplaceAll,
    handleClose,
    hasReplace,
  };
}
