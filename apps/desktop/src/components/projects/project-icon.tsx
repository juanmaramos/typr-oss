import { cn } from "@typr/ui/lib/utils";

import { getProjectIconColorClassName, getProjectIconValue } from "./project-icons";

interface ProjectIconProps {
  color?: string | null;
  icon?: string | null;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md" | "lg" | "picker";
}

const sizeClassNames = {
  sm: "h-5 w-5 rounded-md text-[13px]",
  picker: "h-7 w-7 rounded-md text-base",
  md: "h-8 w-8 rounded-lg text-base",
  lg: "h-12 w-12 rounded-2xl text-xl",
} as const;

export function ProjectIcon({
  color,
  icon,
  className,
  iconClassName,
  size = "md",
}: ProjectIconProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-border",
        sizeClassNames[size],
        getProjectIconColorClassName(color),
        className,
      )}
    >
      <i className={cn(getProjectIconValue(icon), iconClassName)} />
    </span>
  );
}
