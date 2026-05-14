import { getWorkspaceColumnStyle, WORKSPACE_WIDTH_PX } from "@/components/layout/workspace-width";
import { cn } from "@typr/ui/lib/utils";
import type { ReactNode } from "react";

export const PROJECT_WORKSPACE_MAX_WIDTH_PX = WORKSPACE_WIDTH_PX.project;
const PROJECT_WORKSPACE_COLUMN_STYLE = getWorkspaceColumnStyle("project");

interface ProjectPageShellProps {
  children: ReactNode;
  className?: string;
}

export function ProjectPageShell({ children, className }: ProjectPageShellProps) {
  return (
    <main className="scrollbar-native h-full w-full min-w-0 overflow-x-hidden overflow-y-auto">
      <div
        className={cn(
          "mx-auto flex min-h-full w-full min-w-0 flex-col px-8 pb-8 pt-6",
          className,
        )}
        style={PROJECT_WORKSPACE_COLUMN_STYLE}
      >
        {children}
      </div>
    </main>
  );
}
