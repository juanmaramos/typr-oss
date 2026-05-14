import { TemplateIcon } from "@/components/ui/template-icon";
import { getTemplateEditableName, getTemplateLeadingEmoji } from "@/utils/template-presentation";
import { TemplateService } from "@/utils/template-service";
import { type Template } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@typr/ui/components/ui/dropdown-menu";
import { Input } from "@typr/ui/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Textarea } from "@typr/ui/components/ui/textarea";
import { cn } from "@typr/ui/lib/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { SectionsList } from "../components/template-sections";

interface TemplateEditorProps {
  disabled: boolean;
  template: Template;
  onTemplateUpdate: (template: Template) => void;
  onDelete?: () => void;
  isCreator?: boolean;
}

const EMOJI_OPTIONS = [
  "📄",
  "📝",
  "💼",
  "🤝",
  "👔",
  "🌃",
  "📋",
  "💡",
  "🎯",
  "📊",
  "🔍",
  "💭",
  "📈",
  "🚀",
  "⭐",
  "🎨",
  "🔧",
  "📱",
  "💻",
  "📞",
  "✅",
  "❓",
  "💰",
  "🎪",
  "🌟",
  "🎓",
  "🎉",
  "🔔",
  "📌",
  "🎁",
  "🌈",
  "🎭",
  "🏆",
  "💎",
  "🔮",
  "⚡",
  "🌍",
  "🎵",
  "🎬",
  "🎮",
];

export default function TemplateEditor({
  disabled,
  template,
  onTemplateUpdate,
  onDelete,
  isCreator = true,
}: TemplateEditorProps) {
  const { t } = useLingui();

  // Check if this is a built-in template
  const isBuiltinTemplate = !TemplateService.canEditTemplate(template.id);
  const isReadOnly = disabled || isBuiltinTemplate;

  const [selectedEmoji, setSelectedEmoji] = useState(
    () => getTemplateLeadingEmoji(template.title) || "📄",
  );

  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);

  const handleChangeTitle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const titleText = e.target.value;
      const fullTitle = selectedEmoji + " " + titleText;
      onTemplateUpdate({ ...template, title: fullTitle });
    },
    [onTemplateUpdate, template, selectedEmoji],
  );

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      setSelectedEmoji(emoji);
      const titleText = getTemplateEditableName(template.title);
      const fullTitle = emoji + " " + titleText;
      onTemplateUpdate({ ...template, title: fullTitle });
      setEmojiPopoverOpen(false);
    },
    [onTemplateUpdate, template],
  );

  const handleChangeDescription = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onTemplateUpdate({ ...template, description: e.target.value });
    },
    [onTemplateUpdate, template],
  );

  const handleChangeSections = useCallback(
    (sections: Template["sections"]) => {
      onTemplateUpdate({ ...template, sections });
    },
    [onTemplateUpdate, template],
  );

  const handleDuplicate = useCallback(() => {
    // TODO: Implement duplicate functionality
  }, []);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            {isBuiltinTemplate
              ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <TemplateIcon template={template} className="text-lg text-muted-foreground" />
                </div>
              )
              : (
                <Popover open={emojiPopoverOpen} onOpenChange={setEmojiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0 text-lg hover:bg-surface-400"
                    >
                      {selectedEmoji}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-2">
                      <h4 className="font-medium text-xs">
                        <Trans>Emoji</Trans>
                      </h4>
                      <div className="grid grid-cols-8 gap-1">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <Button
                            key={emoji}
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-base hover:bg-surface-400"
                            onClick={() => handleEmojiSelect(emoji)}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

            {/* Title Input */}
            <Input
              readOnly={isReadOnly}
              value={isBuiltinTemplate ? (template.title || "") : getTemplateEditableName(template.title)}
              onChange={handleChangeTitle}
              className={cn(
                "rounded-none border-0 p-0 !text-lg font-semibold focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1",
                isReadOnly && "pointer-events-none",
              )}
              placeholder={t`Untitled Template`}
            />
          </div>

          {/* Menu Button - Show for all templates with different options */}
          {isCreator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <i className="ri-more-line text-base" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer">
                  <i className="ri-file-copy-line mr-2" />
                  <Trans>Duplicate</Trans>
                </DropdownMenuItem>

                {/* Only show separator and delete option for custom templates */}
                {!isBuiltinTemplate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                    >
                      <i className="ri-delete-bin-line mr-2" />
                      <Trans>Delete</Trans>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isBuiltinTemplate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <i className="ri-lock-line text-sm" />
            <Trans>View only</Trans>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          <Trans>Description</Trans>
        </h2>
        <Textarea
          readOnly={isReadOnly}
          value={template.description}
          onChange={handleChangeDescription}
          placeholder={t`Add a description...`}
          className={cn(
            "h-20 resize-none focus-visible:ring-0 focus-visible:ring-offset-0",
            isReadOnly && "pointer-events-none",
          )}
        />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          <Trans>Sections</Trans>
        </h2>
        <SectionsList
          disabled={isReadOnly}
          items={template.sections}
          onChange={handleChangeSections}
        />
      </div>
    </div>
  );
}
