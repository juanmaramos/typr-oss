export const NOTE_PROJECT_DRAG_TYPE = "application/x-typr-note-id";
export const NOTE_PROJECT_DRAG_END_EVENT = "typr:note-project-drag-end";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let activeDraggedNoteId: string | null = null;

export function startNoteProjectDrag(dataTransfer: DataTransfer, noteId: string): boolean {
  if (!SESSION_ID_PATTERN.test(noteId)) {
    return false;
  }

  dataTransfer.setData(NOTE_PROJECT_DRAG_TYPE, noteId);
  dataTransfer.effectAllowed = "link";
  activeDraggedNoteId = noteId;
  return true;
}

export function endNoteProjectDrag(noteId: string) {
  if (activeDraggedNoteId === noteId) {
    activeDraggedNoteId = null;
    window.dispatchEvent(new Event(NOTE_PROJECT_DRAG_END_EVENT));
  }
}

export function isActiveNoteProjectDrag(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types, type => type.toLowerCase());

  return activeDraggedNoteId !== null
    && SESSION_ID_PATTERN.test(activeDraggedNoteId)
    && dataTransfer.files.length === 0
    && types.length === 1
    && types[0] === NOTE_PROJECT_DRAG_TYPE;
}

export function readDroppedNoteId(dataTransfer: DataTransfer): string | null {
  if (!isActiveNoteProjectDrag(dataTransfer)) {
    return null;
  }

  const noteId = dataTransfer.getData(NOTE_PROJECT_DRAG_TYPE);
  return SESSION_ID_PATTERN.test(noteId) && noteId === activeDraggedNoteId ? noteId : null;
}
