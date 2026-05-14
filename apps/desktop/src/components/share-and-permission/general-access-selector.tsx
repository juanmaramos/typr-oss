import { BuildingIcon, ChevronDown, ChevronRight, FolderIcon, GlobeIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { cn } from "@typr/ui/lib/utils";

export interface GeneralAccessSelectorProps {
  expanded: boolean;
  onToggle: () => void;
}

type AccessType = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

const accessTypes: Record<string, AccessType> = {
  invited: {
    icon: <LockIcon className="size-4 text-muted-foreground" />,
    title: "Invited Only",
    description: "Only invited people can access",
  },
  folder: {
    icon: <FolderIcon className="size-4 text-muted-foreground" />,
    title: "Folder Members",
    description: "+ Authorized personnels can access",
  },
  workspace: {
    icon: <BuildingIcon className="size-4 text-muted-foreground" />,
    title: "All Workspace Members",
    description: "+ Everyone in the workspace can access",
  },
  public: {
    icon: <GlobeIcon className="size-4 text-muted-foreground" />,
    title: "Publish Publicly",
    description: "+ Everyone with a link can access",
  },
} as const;

export const GeneralAccessSelector = ({
  expanded,
  onToggle,
}: GeneralAccessSelectorProps) => {
  const [selectedAccess, setSelectedAccess] = useState<keyof typeof accessTypes>("invited");

  return (
    <>
      <div
        className="flex items-center justify-between hover:bg-surface-400 min-h-11 rounded-lg -mx-2 px-2 py-1 cursor-pointer"
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
            {accessTypes[selectedAccess].icon}
          </div>

          <div className="text-sm font-medium">
            {accessTypes[selectedAccess].title}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="hover:bg-transparent">
          {expanded
            ? <ChevronDown className="size-4 text-muted-foreground" />
            : <ChevronRight className="size-4 text-muted-foreground" />}
        </Button>
      </div>
      {expanded && (
        <div className="pl-2 space-y-3">
          {Object.entries(accessTypes).map(
            ([key, { icon, title, description }]) => (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-3 hover:bg-surface-400 rounded-lg -mx-2 px-2 py-1 cursor-pointer",
                  selectedAccess === key && "bg-muted",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAccess(key as keyof typeof accessTypes);
                  if (expanded) {
                    onToggle();
                  }
                }}
              >
                <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
                  {icon}
                </div>
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-xs text-muted-foreground">{description}</div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
};
