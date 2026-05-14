import { getProjectBriefFreshness, markProjectBriefNeedsRefresh, projectBriefQueryKeys } from "@/lib/project-briefs";
import { hashText } from "@/lib/project-context-sources";
import { getProjectKnowledgeFreshness, getProjectSourceDigestReadiness } from "@/lib/project-knowledge";
import { commands as dbCommands, type ProjectKnowledgeJob, type ProjectKnowledgeJobStatus } from "@typr/plugin-db";

export const projectKnowledgeJobQueryKeys = {
  all: "project-knowledge-jobs",
  byProject: "project-knowledge-jobs:project",
} as const;

const PROJECT_KNOWLEDGE_JOB_MAX_ATTEMPTS = 3;
const PROJECT_KNOWLEDGE_JOB_RETRY_BACKOFF_MS = 10_000;

export function isActiveProjectKnowledgeJob(job: ProjectKnowledgeJob) {
  return job.status === "Queued" || job.status === "Running";
}

export function isProjectBriefRefreshJob(job: ProjectKnowledgeJob) {
  return job.job_type === "ProjectBriefRefresh";
}

export function isProjectSynthesisJob(job: ProjectKnowledgeJob) {
  return job.job_type === "ProjectSynthesis";
}

export function isSourceDigestJob(job: ProjectKnowledgeJob) {
  return job.job_type === "SourceDigest";
}

export function shouldRetryProjectKnowledgeJob(job: ProjectKnowledgeJob) {
  return job.attempt_count < PROJECT_KNOWLEDGE_JOB_MAX_ATTEMPTS;
}

export function getProjectKnowledgeJobRetryAt(job: ProjectKnowledgeJob) {
  const retryDelayMs = PROJECT_KNOWLEDGE_JOB_RETRY_BACKOFF_MS * Math.max(1, job.attempt_count);
  return new Date(Date.now() + retryDelayMs).toISOString();
}

export async function enqueueProjectBriefRefreshJob({
  modelId,
  projectId,
}: {
  modelId: string;
  projectId: string;
}) {
  const freshness = await getProjectBriefFreshness(projectId);
  if (freshness.sourceCount === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const [sourceFreshness, sourceDigestJobs] = await Promise.all([
    getProjectKnowledgeFreshness(projectId),
    ensureProjectSourceDigestJobs({ modelId, projectId, now }),
  ]);
  const sourceFingerprint = await hashText(sourceFreshness.sourceFingerprintInput);
  const synthesisJob = await dbCommands.enqueueProjectKnowledgeJob(createProjectKnowledgeJob({
    dedupeKey: `project:${projectId}:synthesis:${sourceFingerprint}`,
    jobType: "ProjectSynthesis",
    modelId,
    now,
    projectId,
  }));
  const enqueued = await dbCommands.enqueueProjectKnowledgeJob(createProjectKnowledgeJob({
    dedupeKey: `project:${projectId}:brief:${freshness.sourceFingerprint}`,
    jobType: "ProjectBriefRefresh",
    modelId,
    now,
    projectId,
  }));
  console.info("[project-knowledge-job] enqueue:brief", {
    projectId,
    jobId: enqueued.id,
    status: enqueued.status,
    dedupeKey: enqueued.dedupe_key,
    sourceJobCount: sourceDigestJobs.jobs.length,
    missingDigestCount: sourceDigestJobs.readiness.missing,
    staleDigestCount: sourceDigestJobs.readiness.stale,
    synthesisJobId: synthesisJob.id,
    sourceCount: freshness.sourceCount,
    fingerprint: freshness.sourceFingerprint,
  });

  return enqueued;
}

export async function ensureProjectSourceDigestJobs({
  modelId,
  now = new Date().toISOString(),
  projectId,
}: {
  modelId: string;
  now?: string;
  projectId: string;
}) {
  const readiness = await getProjectSourceDigestReadiness(projectId);
  const jobs = await Promise.all(
    readiness.issues.map(issue =>
      dbCommands.enqueueProjectKnowledgeJob(createProjectKnowledgeJob({
        dedupeKey: `project:${projectId}:digest:${issue.sourceType}:${issue.sourceId}:${issue.expectedHash}`,
        jobType: "SourceDigest",
        modelId,
        now,
        projectId,
        sourceId: issue.sourceId,
        sourceType: issue.sourceType,
      }))
    ),
  );

  if (readiness.issues.length > 0) {
    console.info("[project-knowledge-job] dependencies:enqueued", {
      projectId,
      sourceJobCount: jobs.length,
      ready: readiness.ready,
      total: readiness.total,
      missing: readiness.missing,
      stale: readiness.stale,
      sources: readiness.issues.slice(0, 5).map(issue => ({
        sourceId: issue.sourceId,
        sourceType: issue.sourceType,
        title: issue.sourceTitle,
        status: issue.status,
      })),
    });
  }

  return { jobs, readiness };
}

export async function markAndEnqueueProjectBriefRefresh(projectId: string) {
  await markProjectBriefNeedsRefresh(projectId);
  return enqueueProjectBriefRefreshJob({
    projectId,
    modelId: "auto",
  });
}

export async function listProjectKnowledgeJobs(projectId: string) {
  return dbCommands.listProjectKnowledgeJobs(projectId);
}

export function getProjectBriefJobQueryKeys(projectId: string) {
  return [
    [projectKnowledgeJobQueryKeys.byProject, projectId],
    [projectBriefQueryKeys.latest, projectId],
    [projectBriefQueryKeys.freshness, projectId],
  ] as const;
}

function createProjectKnowledgeJob({
  dedupeKey,
  jobType,
  modelId,
  now,
  projectId,
  sourceId = null,
  sourceType = null,
}: {
  dedupeKey: string;
  jobType: ProjectKnowledgeJob["job_type"];
  modelId: string;
  now: string;
  projectId: string;
  sourceId?: string | null;
  sourceType?: string | null;
}): ProjectKnowledgeJob {
  return {
    id: `project_knowledge_job_${crypto.randomUUID()}`,
    project_id: projectId,
    job_type: jobType,
    status: "Queued" satisfies ProjectKnowledgeJobStatus,
    dedupe_key: dedupeKey,
    source_type: sourceType,
    source_id: sourceId,
    model_id: modelId,
    attempt_count: 0,
    error_message: null,
    run_after: now,
    queued_at: now,
    started_at: null,
    completed_at: null,
    updated_at: now,
  };
}
