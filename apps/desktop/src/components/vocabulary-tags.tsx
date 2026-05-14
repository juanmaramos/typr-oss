import { Badge } from "@typr/ui/components/ui/badge";
import { cn } from "@typr/ui/lib/utils";
import { X } from "lucide-react";
import { ChangeEvent, KeyboardEvent, useRef, useState } from "react";

interface VocabularyTagsProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function VocabularyTags({
  value,
  onChange,
  placeholder = "e.g., Project Phoenix, OKR cadence",
  className,
}: VocabularyTagsProps) {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tagText: string) => {
    const newTag = tagText.trim();
    if (newTag && !value.includes(newTag)) {
      onChange([...value, newTag]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
    // Refocus input after removing tag
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Check if user typed comma, semicolon, or pressed Tab
    if (newValue.includes(",") || newValue.includes(";")) {
      const tags = newValue.split(/[,;]/).map(t => t.trim()).filter(Boolean);
      tags.forEach(tag => addTag(tag));
      setInputValue("");
      return;
    }

    setInputValue(newValue);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
        setInputValue("");
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      // Remove last tag when backspacing on empty input
      onChange(value.slice(0, -1));
    }
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    if (inputValue.trim()) {
      addTag(inputValue);
      setInputValue("");
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Multi-select input container with inline tags */}
      <div
        onClick={handleContainerClick}
        className={cn(
          "flex flex-wrap items-center gap-1.5 min-h-[2.25rem] px-2.5 py-1.5 border border-input bg-background rounded-md cursor-text transition-colors",
          isFocused && "ring-2 ring-ring ring-offset-2",
          "hover:border-muted-foreground/50",
        )}
      >
        {/* Render tags inline */}
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-muted hover:bg-surface-400/80 border-0 shrink-0 transition-colors"
          >
            <span className="truncate max-w-[120px]">{tag}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="opacity-60 hover:opacity-100 hover:bg-surface-400-foreground/20 rounded-sm p-0.5 transition-all duration-150"
              type="button"
              aria-label={`Remove ${tag}`}
            >
              <X size={10} />
            </button>
          </Badge>
        ))}

        {/* Input field that grows to fill remaining space */}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          onFocus={handleInputFocus}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 outline-none bg-transparent text-sm placeholder:text-muted-foreground min-w-[100px]"
        />
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Press Enter, Tab, or use commas to add multiple terms
      </p>
    </div>
  );
}
