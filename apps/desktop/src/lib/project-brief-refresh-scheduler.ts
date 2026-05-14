import { markAndEnqueueProjectBriefRefresh } from "@/lib/project-knowledge-jobs";
import { listProjectsBySession } from "@/lib/projects";
import type { Session } from "@typr/plugin-db";

const SESSION_PROJECT_BRIEF_REFRESH_DELAY_MS = 5_000;

const pendingRefreshBySession = new Map<string, ReturnType<typeof setTimeout>>();
const lastScheduledSignatureBySession = new Map<string, string>();

export function scheduleProjectBriefRefreshForSession(session: Session) {
  const signature = getSessionProjectContextSignature(session);
  if (lastScheduledSignatureBySession.get(session.id) === signature) {
    return;
  }

  lastScheduledSignatureBySession.set(session.id, signature);

  const pendingRefresh = pendingRefreshBySession.get(session.id);
  if (pendingRefresh) {
    clearTimeout(pendingRefresh);
  }

  pendingRefreshBySession.set(
    session.id,
    setTimeout(() => {
      pendingRefreshBySession.delete(session.id);
      void enqueueProjectBriefRefreshesForSession(session.id);
    }, SESSION_PROJECT_BRIEF_REFRESH_DELAY_MS),
  );
}

async function enqueueProjectBriefRefreshesForSession(sessionId: string) {
  try {
    const projects = await listProjectsBySession(sessionId);
    if (projects.length === 0) {
      return;
    }

    await Promise.all(projects.map(project => markAndEnqueueProjectBriefRefresh(project.id)));
  } catch (error) {
    console.warn("[project-brief] session-refresh:failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function getSessionProjectContextSignature(session: Session) {
  return [
    session.title,
    session.pre_meeting_memo_html ?? "",
    session.enhanced_memo_html ?? "",
    session.auto_enhanced_memo_html ?? "",
    session.raw_memo_html,
  ].join("\n---\n");
}
