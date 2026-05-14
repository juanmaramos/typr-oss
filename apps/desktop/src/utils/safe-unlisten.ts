export type UnlistenFn = (() => void) | null | undefined;

export function safeUnlisten(unlisten: UnlistenFn, scope: string) {
  if (!unlisten) {
    return;
  }

  try {
    Promise.resolve(unlisten()).catch((error) => {
      console.warn(`[events] Failed to unlisten in ${scope}`, error);
    });
  } catch (error) {
    console.warn(`[events] Failed to unlisten in ${scope}`, error);
  }
}
