const LAST_SELECTED_SPACE_KEY_PREFIX = "spaces:last-selected:";

export function normalizeSpaceName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function getSpaceActionErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Please try again.";
}

export function getLastSelectedSpaceId(userId?: string | null): string | null {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(`${LAST_SELECTED_SPACE_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function setLastSelectedSpaceId(userId: string | null | undefined, spaceId: string) {
  if (!userId || typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(`${LAST_SELECTED_SPACE_KEY_PREFIX}${userId}`, spaceId);
  } catch {
    // Ignore storage failures.
  }
}
