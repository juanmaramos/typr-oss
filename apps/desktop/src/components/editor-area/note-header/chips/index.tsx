import { FEATURES } from "@/lib/features";
import { EventChip } from "./event-chip";
import { ParticipantsChip } from "./participants-chip";
import { PastNotesChip } from "./past-notes-chip";
import { ProjectChip } from "./project-chip";
import { TagChip } from "./tag-chip";
import { YouTubeChip } from "./youtube-chip";

export default function NoteHeaderChips({ sessionId, hashtags = [] }: {
  sessionId: string;
  hashtags?: string[];
}) {
  return (
    <div className="flex flex-row flex-wrap items-center gap-x-1 gap-y-1 overflow-x-auto scrollbar-none whitespace-nowrap">
      <EventChip sessionId={sessionId} />
      <YouTubeChip sessionId={sessionId} />
      {FEATURES.PARTICIPANTS_SYSTEM && <ParticipantsChip sessionId={sessionId} />}
      <ProjectChip sessionId={sessionId} />
      <TagChip sessionId={sessionId} hashtags={hashtags} />
      <PastNotesChip sessionId={sessionId} />
    </div>
  );
}
