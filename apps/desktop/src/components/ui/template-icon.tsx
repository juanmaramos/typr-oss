import { getTemplateIconName, getTemplateLeadingEmoji } from "@/utils/template-presentation";
import type { Template } from "@typr/plugin-db";
import { cn } from "@typr/ui/lib/utils";
import { Icon } from "./icon";

type TemplateLike = Pick<Template, "id" | "title"> | null | undefined;

interface TemplateIconProps {
  template: TemplateLike;
  className?: string;
}

export function TemplateIcon({ template, className }: TemplateIconProps) {
  const emoji = getTemplateLeadingEmoji(template?.title);

  if (emoji) {
    return <span className={cn("leading-none", className)}>{emoji}</span>;
  }

  return <Icon name={getTemplateIconName(template)} className={className} />;
}
