import type { ProjectFile, ProjectFileExtraction } from "@typr/plugin-db";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ChangeEvent, type DragEvent, type KeyboardEvent, useId, useRef, useState } from "react";

const FILE_PREVIEW_LIMIT = 8;

interface ProjectFilesDropzoneProps {
  extractions: ProjectFileExtraction[];
  files: ProjectFile[];
  isAdding?: boolean;
  isRemovingFileId?: string | null;
  isRetryingFileId?: string | null;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (file: ProjectFile) => void;
  onRetryFile: (file: ProjectFile) => void;
}

export function ProjectFilesDropzone({
  extractions,
  files,
  isAdding = false,
  isRemovingFileId = null,
  isRetryingFileId = null,
  onAddFiles,
  onRemoveFile,
  onRetryFile,
}: ProjectFilesDropzoneProps) {
  const { t } = useLingui();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const extractionByFileId = new Map(extractions.map(extraction => [extraction.file_id, extraction]));
  const shouldCollapseFiles = files.length > FILE_PREVIEW_LIMIT;
  const visibleFiles = showAllFiles ? files : files.slice(0, FILE_PREVIEW_LIMIT);

  const addFiles = (nextFiles: FileList | File[]) => {
    if (nextFiles.length === 0) {
      return;
    }

    onAddFiles(nextFiles);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) {
      addFiles(event.currentTarget.files);
    }
    event.currentTarget.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLLabelElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    inputRef.current?.click();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <label
        htmlFor={inputId}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-8 py-10 text-center transition-colors",
          "hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragging && "border-primary/50 bg-primary/5",
        )}
      >
        <input ref={inputRef} id={inputId} type="file" multiple className="sr-only" onChange={handleInputChange} />

        <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition-colors group-hover:text-foreground">
          <i className="ri-upload-cloud-2-line text-xl" />
        </span>
        <span className="text-sm font-semibold text-foreground">
          <Trans>Drop files here</Trans>
        </span>
        <span className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          <Trans>Files are stored locally and attached only to this project.</Trans>
        </span>
        <span className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
          <Trans>Text, Markdown, CSV, JSON, YAML, HTML, logs, PDF, and DOCX files are indexed locally for Ask.</Trans>
        </span>
        <span className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground">
          {isAdding ? <Trans>Saving...</Trans> : <Trans>Choose files</Trans>}
        </span>
      </label>

      {files.length > 0 && (
        <div className="min-h-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              <Trans>Files</Trans>
            </h3>
            {isAdding && (
              <Badge variant="outline" className="rounded-full bg-muted/50 text-muted-foreground">
                <Trans>Saving</Trans>
              </Badge>
            )}
          </div>

          <ul className="space-y-1" aria-label={t`Project files`}>
            {visibleFiles.map((file) => {
              const extraction = extractionByFileId.get(file.id) ?? null;
              const status = getDisplayStatus(file, extraction, t);
              const canRetry = file.status === "Done" && extraction?.status === "Failed";
              const detail = file.error_message ?? extraction?.error_message ?? status.detail;

              return (
                <li key={file.id}>
                  <div className="group flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                      <i className={getFileIcon(file.name)} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size_bytes)}</span>
                        <span
                          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", status.className)}
                        >
                          <i className={status.iconClassName} />
                          {status.label}
                        </span>
                        {detail && (
                          <span
                            className={cn(
                              "min-w-0 max-w-[32rem] truncate",
                              status.tone === "error" ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {detail}
                          </span>
                        )}
                      </div>
                    </div>

                    {canRetry && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        disabled={isRetryingFileId === file.id}
                        onClick={() => onRetryFile(file)}
                      >
                        <i className="ri-refresh-line mr-1 text-sm" />
                        <Trans>Retry</Trans>
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      disabled={isRemovingFileId === file.id}
                      onClick={() => onRemoveFile(file)}
                    >
                      <i className="ri-close-line text-base" />
                      <span className="sr-only">
                        <Trans>Remove {file.name}</Trans>
                      </span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {shouldCollapseFiles && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 h-8 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={showAllFiles}
              onClick={() => setShowAllFiles(current => !current)}
            >
              <i className={cn("mr-1 text-sm", showAllFiles ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line")} />
              {showAllFiles ? <Trans>Show fewer</Trans> : <Trans>Show all {files.length} files</Trans>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getDisplayStatus(
  file: ProjectFile,
  extraction: ProjectFileExtraction | null,
  t: ReturnType<typeof useLingui>["t"],
) {
  if (file.status === "Failed") {
    return {
      className: "bg-destructive/10 text-destructive",
      detail: t`Remove this file and add it again.`,
      iconClassName: "ri-error-warning-line",
      label: t`Import failed`,
      tone: "error" as const,
    };
  }

  if (file.status === "Queued" || file.status === "Importing") {
    return {
      className: "bg-muted text-muted-foreground",
      detail: null,
      iconClassName: "ri-loader-4-line",
      label: t`Saving`,
      tone: "neutral" as const,
    };
  }

  switch (extraction?.status) {
    case "Done":
      return {
        className: "bg-success/10 text-success",
        detail: extraction.char_count > 0 ? t`${extraction.char_count.toLocaleString()} chars indexed` : null,
        iconClassName: "ri-check-line",
        label: t`Indexed`,
        tone: "success" as const,
      };
    case "Failed":
      return {
        className: "bg-destructive/10 text-destructive",
        detail: null,
        iconClassName: "ri-error-warning-line",
        label: t`Indexing failed`,
        tone: "error" as const,
      };
    case "Pending":
      return {
        className: "bg-muted text-muted-foreground",
        detail: null,
        iconClassName: "ri-loader-4-line",
        label: t`Indexing`,
        tone: "neutral" as const,
      };
    case "Unsupported":
      return {
        className: "bg-muted text-muted-foreground",
        detail: null,
        iconClassName: "ri-information-line",
        label: t`Saved only`,
        tone: "neutral" as const,
      };
    default:
      return {
        className: "bg-muted text-muted-foreground",
        detail: t`Waiting for indexing status.`,
        iconClassName: "ri-time-line",
        label: t`Saved`,
        tone: "neutral" as const,
      };
  }
}

function getFileIcon(name: string) {
  const normalizedName = name.toLowerCase();
  if (normalizedName.endsWith(".pdf")) {
    return "ri-file-pdf-2-line text-base";
  }
  if (normalizedName.endsWith(".doc") || normalizedName.endsWith(".docx")) {
    return "ri-file-word-line text-base";
  }
  if (normalizedName.endsWith(".ppt") || normalizedName.endsWith(".pptx")) {
    return "ri-file-ppt-line text-base";
  }
  if (
    normalizedName.endsWith(".xls")
    || normalizedName.endsWith(".xlsx")
    || normalizedName.endsWith(".csv")
    || normalizedName.endsWith(".tsv")
  ) {
    return "ri-file-excel-line text-base";
  }
  if (normalizedName.endsWith(".md") || normalizedName.endsWith(".markdown")) {
    return "ri-markdown-line text-base";
  }
  if (normalizedName.endsWith(".txt") || normalizedName.endsWith(".log")) {
    return "ri-file-text-line text-base";
  }
  if (
    normalizedName.endsWith(".json")
    || normalizedName.endsWith(".jsonl")
    || normalizedName.endsWith(".yaml")
    || normalizedName.endsWith(".yml")
    || normalizedName.endsWith(".xml")
    || normalizedName.endsWith(".html")
    || normalizedName.endsWith(".htm")
  ) {
    return "ri-file-code-line text-base";
  }

  return "ri-file-line text-base";
}
