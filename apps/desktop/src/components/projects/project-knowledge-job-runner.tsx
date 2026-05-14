import { projectBriefQueryKeys, refreshProjectBrief } from "@/lib/project-briefs";
import { hashText } from "@/lib/project-context-sources";
import {
  buildAndUpsertProjectKnowledgeSynthesis,
  ensureProjectSourceDigestForSource,
  getProjectKnowledgeFreshness,
  type ProjectSourceDigestReadiness,
} from "@/lib/project-knowledge";
import {
  ensureProjectSourceDigestJobs,
  getProjectKnowledgeJobRetryAt,
  isProjectBriefRefreshJob,
  isProjectSynthesisJob,
  isSourceDigestJob,
  shouldRetryProjectKnowledgeJob,
} from "@/lib/project-knowledge-jobs";
import { projectQueryKeys } from "@/lib/projects";
import { commands as dbCommands, type ProjectKnowledgeJob } from "@typr/plugin-db";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

const PROJECT_KNOWLEDGE_JOB_POLL_MS = 2_000;
const PROJECT_KNOWLEDGE_JOB_RELEASE_MS = 2_000;
const PROJECT_KNOWLEDGE_JOB_STALE_MS = 5 * 60_000;
const PROJECT_KNOWLEDGE_SOURCE_CONCURRENCY = 2;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ProjectKnowledgeJobRunner() {
  const queryClient = useQueryClient();
  const runningJobIdsRef = useRef(new Set<string>());
  const runningSourceJobCountRef = useRef(0);
  const runningBlockingJobRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const reclaimStaleJobs = async () => {
      const staleBefore = new Date(Date.now() - PROJECT_KNOWLEDGE_JOB_STALE_MS).toISOString();
      const reclaimed = await dbCommands.reclaimStaleProjectKnowledgeJobs(staleBefore, 3);
      if (reclaimed.length > 0) {
        console.warn("[project-knowledge-job] stale:reclaimed", {
          count: reclaimed.length,
          jobs: reclaimed.map(job => ({
            jobId: job.id,
            projectId: job.project_id,
            jobType: job.job_type,
            status: job.status,
            attemptCount: job.attempt_count,
          })),
        });
      }
    };

    const tick = async () => {
      if (cancelled || runningBlockingJobRef.current) {
        return;
      }

      try {
        while (!cancelled && !runningBlockingJobRef.current) {
          if (runningSourceJobCountRef.current >= PROJECT_KNOWLEDGE_SOURCE_CONCURRENCY) {
            return;
          }

          const job = await dbCommands.claimNextProjectKnowledgeJob();
          if (!job) {
            return;
          }

          if (runningJobIdsRef.current.has(job.id)) {
            return;
          }

          runningJobIdsRef.current.add(job.id);
          if (isSourceDigestJob(job)) {
            runningSourceJobCountRef.current += 1;
          } else {
            runningBlockingJobRef.current = true;
          }

          void runProjectKnowledgeJob(job).finally(() => {
            runningJobIdsRef.current.delete(job.id);
            if (isSourceDigestJob(job)) {
              runningSourceJobCountRef.current = Math.max(0, runningSourceJobCountRef.current - 1);
            } else {
              runningBlockingJobRef.current = false;
            }
          });
        }
      } catch (error) {
        console.warn("[project-knowledge-job] tick:failed", {
          error: getErrorMessage(error),
        });
      }
    };

    const runProjectKnowledgeJob = async (job: ProjectKnowledgeJob) => {
      console.info("[project-knowledge-job] claimed", {
        jobId: job.id,
        projectId: job.project_id,
        jobType: job.job_type,
        attemptCount: job.attempt_count,
      });

      try {
        if (isSourceDigestJob(job)) {
          if ((job.source_type !== "note" && job.source_type !== "file") || !job.source_id) {
            throw new Error("Source digest job is missing a valid source.");
          }
          await ensureProjectSourceDigestForSource({
            projectId: job.project_id,
            sourceType: job.source_type,
            sourceId: job.source_id,
            modelId: job.model_id ?? "auto",
          });
        } else if (isProjectSynthesisJob(job)) {
          const { readiness } = await ensureProjectSourceDigestJobs({
            projectId: job.project_id,
            modelId: job.model_id ?? "auto",
          });
          if (!isProjectSourceDigestReadinessComplete(readiness)) {
            await releaseJob(job, { sourceDigestReadiness: readiness });
            return;
          }
          await buildAndUpsertProjectKnowledgeSynthesis(job.project_id, job.model_id ?? "auto");
        } else if (isProjectBriefRefreshJob(job)) {
          const freshness = await getProjectKnowledgeFreshness(job.project_id);
          const synthesis = await dbCommands.getProjectKnowledgeSynthesis(job.project_id);
          const expectedSynthesisFingerprint = await hashProjectSourceFingerprint(freshness.sourceFingerprintInput);
          if (synthesis?.source_fingerprint !== expectedSynthesisFingerprint) {
            const { readiness } = await ensureProjectSourceDigestJobs({
              projectId: job.project_id,
              modelId: job.model_id ?? "auto",
            });
            await releaseJob(job, {
              expectedSynthesisFingerprint,
              sourceDigestReadiness: readiness,
              synthesisFingerprint: synthesis?.source_fingerprint ?? null,
            });
            return;
          }
          await refreshProjectBrief({
            projectId: job.project_id,
            modelId: job.model_id ?? "auto",
          });
        } else {
          throw new Error(`Unsupported project knowledge job type: ${job.job_type}`);
        }
        await dbCommands.completeProjectKnowledgeJob(job.id);
        console.info("[project-knowledge-job] complete", {
          jobId: job.id,
          projectId: job.project_id,
          jobType: job.job_type,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        if (shouldRetryProjectKnowledgeJob(job)) {
          const runAfter = getProjectKnowledgeJobRetryAt(job);
          await dbCommands.retryProjectKnowledgeJob(job.id, message, runAfter);
          console.warn("[project-knowledge-job] retry:scheduled", {
            jobId: job.id,
            projectId: job.project_id,
            jobType: job.job_type,
            attemptCount: job.attempt_count,
            runAfter,
            error: message,
          });
        } else {
          await dbCommands.failProjectKnowledgeJob(job.id, message);
          console.warn("[project-knowledge-job] failed", {
            jobId: job.id,
            projectId: job.project_id,
            jobType: job.job_type,
            attemptCount: job.attempt_count,
            error: message,
          });
        }
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["project-knowledge-jobs:project", job.project_id] }),
          queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, job.project_id] }),
          queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, job.project_id] }),
          queryClient.invalidateQueries({ queryKey: [projectQueryKeys.sources, job.project_id] }),
        ]);
      }
    };

    const releaseJob = async (job: ProjectKnowledgeJob, dependency?: ProjectKnowledgeDependencyLog) => {
      const runAfter = new Date(Date.now() + PROJECT_KNOWLEDGE_JOB_RELEASE_MS).toISOString();
      await dbCommands.releaseProjectKnowledgeJob(job.id, runAfter);
      console.info("[project-knowledge-job] dependency:waiting", {
        jobId: job.id,
        projectId: job.project_id,
        jobType: job.job_type,
        runAfter,
        ...formatDependencyLog(dependency),
      });
    };

    void reclaimStaleJobs();
    void tick();
    const intervalId = window.setInterval(() => void tick(), PROJECT_KNOWLEDGE_JOB_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [queryClient]);

  return null;
}

async function hashProjectSourceFingerprint(input: string) {
  return hashText(input);
}

type ProjectKnowledgeDependencyLog = {
  expectedSynthesisFingerprint?: string;
  sourceDigestReadiness?: ProjectSourceDigestReadiness;
  synthesisFingerprint?: string | null;
};

function isProjectSourceDigestReadinessComplete(readiness: ProjectSourceDigestReadiness) {
  return readiness.failed === 0 && readiness.issues.length === 0 && readiness.ready === readiness.total;
}

function formatDependencyLog(dependency?: ProjectKnowledgeDependencyLog) {
  if (!dependency) {
    return {};
  }

  const readiness = dependency.sourceDigestReadiness;
  return {
    expectedSynthesisFingerprint: dependency.expectedSynthesisFingerprint,
    synthesisFingerprint: dependency.synthesisFingerprint,
    sourceDigestReady: readiness?.ready,
    sourceDigestTotal: readiness?.total,
    sourceDigestMissing: readiness?.missing,
    sourceDigestStale: readiness?.stale,
    sourceDigestFailed: readiness?.failed,
    sourceDigestIssues: readiness?.issues.slice(0, 5).map(issue => ({
      sourceId: issue.sourceId,
      sourceType: issue.sourceType,
      title: issue.sourceTitle,
      status: issue.status,
    })),
  };
}
