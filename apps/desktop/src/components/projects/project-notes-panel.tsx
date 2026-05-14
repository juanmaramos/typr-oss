import { ProjectFilesDropzone } from "@/components/projects/project-files-dropzone";
import { Tab } from "@/components/ui/tab";
import { useTypr } from "@/contexts";
import { projectBriefQueryKeys } from "@/lib/project-briefs";
import {
  addProjectFiles,
  deleteProjectFile,
  listProjectFileExtractions,
  listProjectFiles,
  projectFileQueryKeys,
  retryProjectFileExtraction,
} from "@/lib/project-files";
import { markAndEnqueueProjectBriefRefresh, projectKnowledgeJobQueryKeys } from "@/lib/project-knowledge-jobs";
import { getProjectActionErrorMessage } from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import type { ProjectFile } from "@typr/plugin-db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@typr/ui/components/ui/alert-dialog";
import { NumberBadge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { toast } from "@typr/ui/components/ui/toast";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

interface ProjectNotesPanelProps {
  children: ReactNode;
  count: number;
  onAddNotes: () => void;
  projectId: string;
}

type ProjectNotesTab = "notes" | "files";

export function ProjectNotesPanel({ children, count, onAddNotes, projectId }: ProjectNotesPanelProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const [selectedTab, setSelectedTab] = useState<ProjectNotesTab | null>(null);
  const [fileToRemove, setFileToRemove] = useState<ProjectFile | null>(null);
  const hasNotes = count > 0;
  const filesQuery = useQuery({
    queryKey: [projectFileQueryKeys.list, projectId],
    queryFn: () => listProjectFiles(projectId),
  });
  const extractionsQuery = useQuery({
    queryKey: [projectFileQueryKeys.extractions, projectId],
    queryFn: () => listProjectFileExtractions(projectId),
  });
  const files = filesQuery.data ?? [];
  const extractions = extractionsQuery.data ?? [];
  const defaultTab: ProjectNotesTab = !hasNotes && files.length > 0 ? "files" : "notes";
  const activeTab = selectedTab ?? defaultTab;
  const fileToRemoveName = fileToRemove?.name ?? t`this file`;
  const handleTabSelect = (value: string) => {
    if (value === "notes" || value === "files") {
      setSelectedTab(value);
    }
  };

  const addFilesMutation = useMutation({
    mutationFn: (files: FileList | File[]) => addProjectFiles(projectId, files),
    onSuccess: async (projectFiles, files) => {
      const fileCount = Array.from(files).length;
      trackEvent("project_files_added", userId, {
        project_id: projectId,
        file_count: fileCount,
        saved_count: projectFiles.length,
        failed_count: fileCount - projectFiles.length,
      });
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [projectFileQueryKeys.list, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectFileQueryKeys.extractions, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "project-files-add-error",
        title: <Trans>Couldn’t save files</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const removeFileMutation = useMutation({
    mutationFn: deleteProjectFile,
    onSuccess: async (_result, file) => {
      setFileToRemove(null);
      trackEvent("project_file_removed", userId, {
        project_id: projectId,
        status: file.status,
      });
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [projectFileQueryKeys.list, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectFileQueryKeys.extractions, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "project-files-remove-error",
        title: <Trans>Couldn’t remove file</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const retryFileMutation = useMutation({
    mutationFn: retryProjectFileExtraction,
    onSuccess: async (extraction) => {
      trackEvent("project_file_index_retry", userId, {
        project_id: projectId,
        status: extraction.status,
      });
      await markAndEnqueueProjectBriefRefresh(projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [projectFileQueryKeys.extractions, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectKnowledgeJobQueryKeys.byProject, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.latest, projectId] }),
        queryClient.invalidateQueries({ queryKey: [projectBriefQueryKeys.freshness, projectId] }),
      ]);
    },
    onError: (error) => {
      toast({
        id: "project-files-retry-error",
        title: <Trans>Couldn’t retry indexing</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  return (
    <>
      <section className="shrink-0 pb-8 pt-2">
        <div className="flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 border-b border-border/80">
              <Tab
                text={t`Notes`}
                value="notes"
                selected={activeTab === "notes"}
                onSelect={handleTabSelect}
                iconClassName="ri-article-line"
                trailing={<NumberBadge value={count} variant="secondary" aria-label={t`${count} notes`} />}
              />
              <Tab
                text={t`Files`}
                value="files"
                selected={activeTab === "files"}
                onSelect={handleTabSelect}
                iconClassName="ri-stack-line"
                trailing={
                  <NumberBadge value={files.length} variant="secondary" aria-label={t`${files.length} files`} />
                }
              />
            </div>

            {activeTab === "notes" && hasNotes && (
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={onAddNotes}>
                <i className="ri-add-line mr-1 text-base" />
                <Trans>Add notes</Trans>
              </Button>
            )}
          </div>

          {activeTab === "notes" && (
            <div
              className={cn(
                "mt-0",
                hasNotes ? "py-1" : "flex min-h-[320px] justify-center px-10 pb-6 pt-6",
              )}
            >
              {children}
            </div>
          )}

          {activeTab === "files" && (
            <div className="mt-0 flex min-h-[360px] px-1 pb-6 pt-1">
              <ProjectFilesDropzone
                extractions={extractions}
                files={files}
                isAdding={addFilesMutation.isPending}
                isRemovingFileId={removeFileMutation.variables?.id ?? null}
                isRetryingFileId={retryFileMutation.variables?.id ?? null}
                onAddFiles={files => addFilesMutation.mutate(files)}
                onRemoveFile={setFileToRemove}
                onRetryFile={file => retryFileMutation.mutate(file)}
              />
            </div>
          )}
        </div>
      </section>

      <AlertDialog
        open={fileToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removeFileMutation.isPending) {
            setFileToRemove(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Remove “{fileToRemoveName}”?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                This deletes the project’s local copy and indexed text from this device. The original file outside Typr
                is unchanged, and the project brief will refresh without this source.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeFileMutation.isPending}>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeFileMutation.isPending || !fileToRemove}
              onClick={(event) => {
                event.preventDefault();
                if (fileToRemove) {
                  removeFileMutation.mutate(fileToRemove);
                }
              }}
            >
              <Trans>Remove file</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
