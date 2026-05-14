import { useEffect, useRef, useState } from "react";

interface SimpleSpeakerBadgeProps {
  speakerIndex: number;
  currentName: string;
  onNameChange: (newName: string) => void;
  isEditable: boolean;
}

export function SimpleSpeakerBadge({
  speakerIndex,
  currentName,
  onNameChange,
  isEditable,
}: SimpleSpeakerBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempName(currentName);
  }, [currentName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (isEditable) {
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const newName = tempName.trim();
    if (newName && newName !== currentName) {
      onNameChange(newName);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempName(currentName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center mt-4 sticky top-0 z-10">
        <input
          ref={inputRef}
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="px-2 py-1 text-xs font-medium bg-background border border-primary/40 rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          style={{ minWidth: "60px", width: `${Math.max(60, tempName.length * 8)}px` }}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 sticky top-0 z-10">
      <button
        className={`inline-flex items-center px-2 py-1 text-xs font-semibold text-foreground/80 rounded-md transition-colors -ml-1 ${
          isEditable
            ? "hover:text-foreground hover:bg-surface-400/50 cursor-text border border-transparent hover:border-border/30"
            : "cursor-default"
        }`}
        onClick={handleClick}
        title={isEditable ? "Click to edit speaker name inline" : undefined}
      >
        {currentName}
      </button>
    </div>
  );
}
