import { FileClock } from "lucide-react";
import { noteHeaderChipClassName } from "../styles";

interface PastNotesChipProps {
  sessionId: string;
}

export function PastNotesChip({ sessionId }: PastNotesChipProps) {
  if (sessionId) {
    return null;
  }

  return (
    <button className={noteHeaderChipClassName}>
      <FileClock size={14} className="flex-shrink-0" />
      <span className="truncate">
        Past Notes
      </span>
    </button>
  );
}
