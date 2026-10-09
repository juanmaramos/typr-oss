import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";

// Remix Icon Components (with original sizes maintained)
function ChevronUpIcon({ size = 14, className = "" }) {
  return <i className={`ri-arrow-up-s-line ${className}`} style={{ fontSize: size }} />;
}

function ChevronDownIcon({ size = 14, className = "" }) {
  return <i className={`ri-arrow-down-s-line ${className}`} style={{ fontSize: size }} />;
}

function ReplaceIcon({ size = 14, className = "" }) {
  return <i className={`ri-swap-3-line ${className}`} style={{ fontSize: size }} />;
}

function XIcon({ size = 14, className = "" }) {
  return <i className={`ri-close-line ${className}`} style={{ fontSize: size }} />;
}
import { SearchTarget, useSearch } from "./use-search";

interface SearchHeaderProps {
  target: SearchTarget;
  onClose: () => void;
  hasReplace?: boolean;
  placeholder?: string;
}

export function SearchHeader({
  target,
  onClose,
  hasReplace = false,
  placeholder,
}: SearchHeaderProps) {
  const { t } = useLingui();
  // Add ref for the search header container
  const searchHeaderRef = useRef<HTMLDivElement>(null);

  const {
    searchTerm,
    setSearchTerm,
    replaceTerm,
    setReplaceTerm,
    resultCount,
    currentIndex,
    handleNext,
    handlePrevious,
    handleReplaceAll,
    handleClose,
  } = useSearch({
    target,
    onClose,
    hasReplace,
  });

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchHeaderRef.current && !searchHeaderRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevious();
        } else {
          handleNext();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrevious, handleClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    }
  };

  return (
    <header
      ref={searchHeaderRef}
      className="flex items-center w-full px-4 py-1 my-1 border-b border/50 bg-muted/50"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Search Input */}
        <div className="flex items-center gap-1 bg-transparent border border rounded px-2 py-0.5 mb-1.5 flex-1 max-w-xs">
          <Input
            className="h-5 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1 bg-transparent flex-1 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? t`Find`}
            autoFocus
          />
        </div>

        {/* Replace Input (conditional) */}
        {hasReplace && (
          <div className="flex items-center gap-1 bg-transparent border border rounded px-2 py-0.5 mb-1.5 flex-1 max-w-xs">
            <Input
              className="h-5 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-1 bg-transparent flex-1 text-xs"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t`Replace...`}
            />
          </div>
        )}

        {/* Results Counter */}
        {searchTerm && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {resultCount > 0 ? `${currentIndex}/${resultCount}` : "0/0"}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 ml-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handlePrevious}
          disabled={resultCount === 0}
          title={t`Previous (Shift+Enter)`}
        >
          <ChevronUpIcon size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleNext}
          disabled={resultCount === 0}
          title={t`Next (Enter)`}
        >
          <ChevronDownIcon size={14} />
        </Button>

        {/* Replace button (conditional) */}
        {hasReplace && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReplaceAll}
            disabled={!searchTerm || resultCount === 0}
            className="h-7 px-2"
            title={t`Replace All`}
          >
            <ReplaceIcon size={14} />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleClose}
          title={t`Close (Esc)`}
        >
          <XIcon size={14} />
        </Button>
      </div>
    </header>
  );
}
