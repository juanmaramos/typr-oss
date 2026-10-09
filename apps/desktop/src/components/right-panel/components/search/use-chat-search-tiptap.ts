import { useCallback, useEffect, useState } from "react";

export function useChatSearchTipTap(content: string, onClose: () => void) {
  const [searchTerm, setSearchTerm] = useState("");
  const [resultCount, setResultCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [_results, setResults] = useState<number[]>([]);

  // Apply search highlighting
  useEffect(() => {
    // Create and add styles to document
    const style = document.createElement("style");
    style.textContent = `
      .search-highlight {
        background-color: hsla(48, 100%, 50%, 0.3) !important;
        border-radius: 0.125rem !important;
        padding: 0 0.125rem !important;
      }
      .search-highlight-current {
        background-color: hsla(39, 100%, 50%, 0.5) !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
      clearHighlights();
    };
  }, []);

  // Search when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      clearHighlights();
      setResults([]);
      setResultCount(0);
      setCurrentIndex(0);
      return;
    }

    const debouncedSearch = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(debouncedSearch);
  }, [searchTerm]);

  // Clear all highlighted elements
  const clearHighlights = useCallback(() => {
    const highlightedElements = document.querySelectorAll(".search-highlight, .search-highlight-current");
    highlightedElements.forEach(el => {
      const parent = el.parentElement;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ""), el);
        parent.normalize();
      }
    });
  }, []);

  // Perform search on message elements
  const performSearch = useCallback(() => {
    // Clear previous highlights
    clearHighlights();

    if (!searchTerm.trim()) {
      return;
    }

    const messageElements = document.querySelectorAll(".whitespace-pre-wrap");
    const foundIndexes: number[] = [];
    let totalMatches = 0;

    messageElements.forEach((el, messageIdx) => {
      const text = el.textContent || "";
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

      // Test if this element contains any matches
      if (!searchRegex.test(text)) {
        return;
      }

      // Reset the regex to start from the beginning
      searchRegex.lastIndex = 0;

      // Create a document fragment to hold the highlighted content
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;

      // Find all matches in this text element
      while ((match = searchRegex.exec(text)) !== null) {
        // Add the text before the match
        if (match.index > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, match.index)),
          );
        }

        // Create the highlight span
        const highlightSpan = document.createElement("span");
        highlightSpan.className = "search-highlight";
        highlightSpan.textContent = match[0]; // Use the exact match
        highlightSpan.dataset.matchIndex = totalMatches.toString();

        // Add the highlighted match to the fragment
        fragment.appendChild(highlightSpan);

        // Track match position
        foundIndexes.push(messageIdx);
        totalMatches++;

        // Update the lastIndex to after this match
        lastIndex = searchRegex.lastIndex;
      }

      // Add any remaining text after the last match
      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex)),
        );
      }

      // Replace the element's content with the highlighted version
      el.textContent = "";
      el.appendChild(fragment);
    });

    setResults(foundIndexes);
    setResultCount(totalMatches);

    // If we found any matches, highlight the first one as current
    if (totalMatches > 0) {
      setCurrentIndex(1);
      highlightCurrentMatch(0);
    }
  }, [searchTerm, clearHighlights]);

  // Highlight the current match and scroll to it
  const highlightCurrentMatch = useCallback((index: number) => {
    // Remove current highlight class from all elements
    document.querySelectorAll(".search-highlight-current").forEach(el => {
      el.classList.remove("search-highlight-current");
    });

    // Find the element with the matching index
    const highlightElement = document.querySelector(`.search-highlight[data-match-index="${index}"]`);
    if (highlightElement) {
      highlightElement.classList.add("search-highlight-current");
      highlightElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, []);

  // Go to next match
  const handleNext = useCallback(() => {
    if (resultCount === 0) {
      return;
    }

    const nextIndex = currentIndex % resultCount;
    setCurrentIndex(nextIndex + 1);
    highlightCurrentMatch(nextIndex);
  }, [resultCount, currentIndex, highlightCurrentMatch]);

  // Go to previous match
  const handlePrevious = useCallback(() => {
    if (resultCount === 0) {
      return;
    }

    let prevIndex = currentIndex - 2;
    if (prevIndex < 0) {
      prevIndex = resultCount - 1;
    }

    setCurrentIndex(prevIndex + 1);
    highlightCurrentMatch(prevIndex);
  }, [resultCount, currentIndex, highlightCurrentMatch]);

  // Close search and clean up
  const handleClose = useCallback(() => {
    clearHighlights();
    onClose();
  }, [clearHighlights, onClose]);

  return {
    searchTerm,
    setSearchTerm,
    resultCount,
    currentIndex,
    handleNext,
    handlePrevious,
    handleClose,
  };
}
