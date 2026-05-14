import {
  DEFAULT_PROJECT_ICON_COLOR,
  DEFAULT_PROJECT_ICON_TYPE,
  DEFAULT_PROJECT_ICON_VALUE,
  getProjectIconColor,
  getProjectIconValue,
  type ProjectIconColor,
  type ProjectIconValue,
} from "@/components/projects/project-icons";
import { deleteProjectFile, listProjectFiles } from "@/lib/project-files";
import {
  commands as dbCommands,
  type ProjectSource,
  type ProjectSourceStatus,
  type Session,
  type Space,
} from "@typr/plugin-db";

const LAST_SELECTED_PROJECT_KEY_PREFIX = "projects:last-selected:";
const LEGACY_LAST_SELECTED_SPACE_KEY_PREFIX = "spaces:last-selected:";

export const PROJECT_DESCRIPTION_MAX_LENGTH = 280;

export interface Project extends Space {
  icon_type: string;
  icon_value: string;
  icon_color: string;
}

export const projectQueryKeys = {
  all: "projects",
  detail: "project",
  sessions: "project-sessions",
  includedSessions: "project-included-sessions",
  sources: "project-sources",
  sessionMemberships: "project-session-memberships",
  noteCandidates: "project-note-candidates",
  legacyAll: "spaces",
  legacyDetail: "space",
  legacySessions: "space-sessions",
} as const;

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function clampProjectDescription(description: string): string {
  return description.slice(0, PROJECT_DESCRIPTION_MAX_LENGTH);
}

export function normalizeProject(project: Space | Project): Project {
  const projectWithMetadata = project as Space & Partial<Project>;

  return {
    ...project,
    icon_type: projectWithMetadata.icon_type ?? DEFAULT_PROJECT_ICON_TYPE,
    icon_value: getProjectIconValue(projectWithMetadata.icon_value),
    icon_color: getProjectIconColor(projectWithMetadata.icon_color),
  };
}

export function getProjectActionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Try again in a moment.";
}

export function getLastSelectedProjectId(userId?: string | null): string | null {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(`${LAST_SELECTED_PROJECT_KEY_PREFIX}${userId}`)
      ?? localStorage.getItem(`${LEGACY_LAST_SELECTED_SPACE_KEY_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function setLastSelectedProjectId(userId: string | null | undefined, projectId: string) {
  if (!userId || typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(`${LAST_SELECTED_PROJECT_KEY_PREFIX}${userId}`, projectId);
  } catch {
    // Ignore storage failures. Last selected project is only a convenience.
  }
}

export async function listProjects(): Promise<Project[]> {
  return (await dbCommands.listSpaces()).map(normalizeProject);
}

function getProjectRecency(project: Project): number {
  return new Date(project.updated_at ?? project.created_at).getTime();
}

export function getRecentProjects(projects: Project[], limit: number): Project[] {
  return [...projects]
    .sort((a, b) => {
      const recencyDelta = getProjectRecency(b) - getProjectRecency(a);
      if (recencyDelta !== 0) {
        return recencyDelta;
      }

      const createdDelta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (createdDelta !== 0) {
        return createdDelta;
      }

      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const project = await dbCommands.getSpace(projectId);
  return project ? normalizeProject(project) : null;
}

interface CreateProjectOptions {
  description?: string | null;
  iconColor?: ProjectIconColor;
  iconValue?: ProjectIconValue;
}

export async function createProject(
  name: string,
  descriptionOrOptions?: string | null | CreateProjectOptions,
): Promise<Project> {
  const now = new Date().toISOString();
  const options = typeof descriptionOrOptions === "object" && descriptionOrOptions !== null
    ? descriptionOrOptions
    : { description: descriptionOrOptions };
  const normalizedDescription = options.description?.trim() || null;

  const project: Project = {
    id: crypto.randomUUID(),
    name,
    description: normalizedDescription,
    icon_type: DEFAULT_PROJECT_ICON_TYPE,
    icon_value: getProjectIconValue(options.iconValue ?? DEFAULT_PROJECT_ICON_VALUE),
    icon_color: getProjectIconColor(options.iconColor ?? DEFAULT_PROJECT_ICON_COLOR),
    created_at: now,
    updated_at: now,
  };

  return normalizeProject(await dbCommands.createSpace(project));
}

export async function updateProject(project: Project): Promise<Project> {
  return normalizeProject(await dbCommands.updateSpace(project));
}

export async function deleteProject(projectId: string): Promise<null> {
  const files = await listProjectFiles(projectId);
  await Promise.all(files.map(file => deleteProjectFile(file)));
  return dbCommands.deleteSpace(projectId);
}

export async function assignSessionToProject(sessionId: string, projectId: string): Promise<null> {
  return dbCommands.addProjectSource(projectId, sessionId);
}

export async function removeSessionFromProject(sessionId: string, projectId: string): Promise<null> {
  return dbCommands.removeProjectSource(projectId, sessionId);
}

export async function clearSessionProject(sessionId: string): Promise<null> {
  return dbCommands.clearSessionSpace(sessionId);
}

export async function listSessionsByProject(
  projectId: string,
  limit: number | null,
  search: string | null,
): Promise<Session[]> {
  return dbCommands.listSessionsBySpace(projectId, limit, search);
}

export async function listIncludedSessionsByProject(
  projectId: string,
  limit: number | null,
  search: string | null,
): Promise<Session[]> {
  return dbCommands.listIncludedSessionsBySpace(projectId, limit, search);
}

export function listProjectSources(projectId: string): Promise<ProjectSource[]> {
  return dbCommands.listProjectSources(projectId);
}

export async function listProjectsBySession(sessionId: string): Promise<Project[]> {
  return (await dbCommands.listProjectsBySession(sessionId)).map(normalizeProject);
}

export function setProjectSourceStatus(
  projectId: string,
  sessionId: string,
  status: ProjectSourceStatus,
): Promise<null> {
  return dbCommands.setProjectSourceStatus(projectId, sessionId, status);
}

export function isProjectQueryKey(key: unknown): boolean {
  return [
    projectQueryKeys.all,
    projectQueryKeys.detail,
    projectQueryKeys.sessions,
    projectQueryKeys.includedSessions,
    projectQueryKeys.sources,
    projectQueryKeys.sessionMemberships,
    projectQueryKeys.noteCandidates,
    projectQueryKeys.legacyAll,
    projectQueryKeys.legacyDetail,
    projectQueryKeys.legacySessions,
    "session",
  ].includes(String(key));
}
