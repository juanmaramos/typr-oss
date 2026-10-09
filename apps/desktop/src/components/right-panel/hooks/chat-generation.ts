const activeChatGenerations = new Map<string, AbortController>();

export function startChatGeneration(sessionId: string): AbortController | null {
  if (activeChatGenerations.has(sessionId)) {
    return null;
  }

  const controller = new AbortController();
  activeChatGenerations.set(sessionId, controller);
  return controller;
}

export function hasActiveChatGeneration(sessionId: string): boolean {
  return activeChatGenerations.has(sessionId);
}

export function abortChatGeneration(sessionId: string): boolean {
  const controller = activeChatGenerations.get(sessionId);
  if (!controller) {
    return false;
  }

  controller.abort();
  return true;
}

export function finishChatGeneration(sessionId: string, controller: AbortController): boolean {
  if (activeChatGenerations.get(sessionId) !== controller) {
    return false;
  }

  activeChatGenerations.delete(sessionId);
  return true;
}
