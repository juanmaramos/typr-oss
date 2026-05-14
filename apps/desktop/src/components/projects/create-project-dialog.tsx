import { ProjectIconPicker } from "@/components/projects/project-icon-picker";
import {
  DEFAULT_PROJECT_ICON_COLOR,
  DEFAULT_PROJECT_ICON_VALUE,
  type ProjectIconColor,
  type ProjectIconValue,
} from "@/components/projects/project-icons";
import { useTypr } from "@/contexts";
import {
  clampProjectDescription,
  createProject,
  getProjectActionErrorMessage,
  isProjectQueryKey,
  normalizeProjectName,
  PROJECT_DESCRIPTION_MAX_LENGTH,
} from "@/lib/projects";
import { trackEvent } from "@/utils/analytics-events";
import { Button } from "@typr/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@typr/ui/components/ui/dialog";
import { Input } from "@typr/ui/components/ui/input";
import { Textarea } from "@typr/ui/components/ui/textarea";
import { toast } from "@typr/ui/components/ui/toast";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconValue, setIconValue] = useState<ProjectIconValue>(DEFAULT_PROJECT_ICON_VALUE);
  const [iconColor, setIconColor] = useState<ProjectIconColor>(DEFAULT_PROJECT_ICON_COLOR);

  const createProjectMutation = useMutation({
    mutationFn: async ({ nextName, nextDescription }: { nextName: string; nextDescription: string }) => {
      return createProject(nextName, {
        description: nextDescription,
        iconValue,
        iconColor,
      });
    },
    onSuccess: async (project) => {
      trackEvent("project_created", userId, {
        project_id: project.id,
        source: "project_dialog",
        has_description: Boolean(project.description?.trim()),
      });
      await queryClient.invalidateQueries({
        predicate: query => isProjectQueryKey(query.queryKey[0]),
      });
      setName("");
      setDescription("");
      setIconValue(DEFAULT_PROJECT_ICON_VALUE);
      setIconColor(DEFAULT_PROJECT_ICON_COLOR);
      onOpenChange(false);
      navigate({ to: "/app/projects/$projectId", params: { projectId: project.id } });
    },
    onError: (error) => {
      toast({
        id: "projects-create-error",
        title: <Trans>Couldn’t create project</Trans>,
        content: getProjectActionErrorMessage(error),
      });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen && !createProjectMutation.isPending) {
      setName("");
      setDescription("");
      setIconValue(DEFAULT_PROJECT_ICON_VALUE);
      setIconColor(DEFAULT_PROJECT_ICON_COLOR);
    }
  };

  const handleCreateProject = () => {
    const nextName = normalizeProjectName(name);
    if (!nextName) {
      return;
    }

    createProjectMutation.mutate({ nextName, nextDescription: description });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>
            <Trans>Create project</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Group related notes around a client, topic, initiative, or area of work.</Trans>
          </DialogDescription>
        </DialogHeader>

        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t`Close`}
          >
            <i className="ri-close-line text-base" />
          </button>
        </DialogClose>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreateProject();
          }}
        >
          <div className="space-y-2">
            <label htmlFor={nameId} className="text-sm font-medium text-foreground">
              <Trans>Name and icon</Trans>
            </label>
            <div className="flex items-center gap-2">
              <ProjectIconPicker
                icon={iconValue}
                color={iconColor}
                triggerSize="md"
                triggerClassName="rounded-lg"
                onChange={(next) => {
                  setIconValue(next.icon);
                  setIconColor(next.color);
                }}
              />
              <Input
                id={nameId}
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={t`Project name`}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={descriptionId} className="text-sm font-medium text-foreground">
              <Trans>Description</Trans>{" "}
              <span className="font-normal text-muted-foreground">
                <Trans>optional</Trans>
              </span>
            </label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={event => setDescription(clampProjectDescription(event.target.value))}
              placeholder={t`What is this project for?`}
              maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
              className="min-h-20 resize-none"
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <Trans>Cancel</Trans>
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={createProjectMutation.isPending || !normalizeProjectName(name)}
            >
              <Trans>Create</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
