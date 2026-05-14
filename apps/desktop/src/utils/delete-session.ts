import { commands as dbCommands } from "@typr/plugin-db";

import { commands } from "@/types";

export async function deleteSessionWithWelcomeDismissal(
  sessionId: string,
  welcomeSessionId?: string | null,
) {
  const result = await dbCommands.deleteSession(sessionId);

  if (welcomeSessionId && sessionId === welcomeSessionId) {
    await commands.dismissWelcomeNote();
  }

  return result;
}
