import { Trans, useLingui } from "@lingui/react/macro";
import { Reorder, useDragControls } from "motion/react";
import { useCallback, useState } from "react";

import { type Template } from "@typr/plugin-db";
import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { Textarea } from "@typr/ui/components/ui/textarea";

type ReorderItem = Template["sections"][number];

interface SectionsListProps {
  disabled: boolean;
  items: ReorderItem[];
  onChange: (items: ReorderItem[]) => void;
}

export function SectionsList({
  disabled,
  items: _items,
  onChange,
}: SectionsListProps) {
  const controls = useDragControls();

  const [items, setItems] = useState(
    _items.map((item) => ({ ...item, id: crypto.randomUUID() as string })),
  );

  const handleChange = (item: ReorderItem & { id: string }) => {
    setItems(items.map((i) => (i.id === item.id ? item : i)));
    onChange(items);
  };

  const handleDelete = (itemId: string) => {
    const newItems = items.filter((item) => item.id !== itemId);
    setItems(newItems);
    onChange(newItems);
  };

  const handleReorder = (v: typeof items) => {
    if (disabled) {
      return;
    }
    setItems(v);
    onChange(v);
  };

  const handleAddSection = () => {
    const newItem = {
      id: crypto.randomUUID(),
      title: "",
      description: "",
    };
    setItems([...items, newItem]);
    onChange([...items, newItem]);
  };

  return (
    <div className="flex flex-col space-y-3">
      <Reorder.Group values={items} onReorder={handleReorder}>
        <div className="flex flex-col space-y-2">
          {items.map((item) => (
            <Reorder.Item key={item.id} value={item}>
              <SectionItem
                disabled={disabled}
                item={item}
                onChange={handleChange}
                onDelete={handleDelete}
                dragControls={controls}
              />
            </Reorder.Item>
          ))}
        </div>
      </Reorder.Group>

      {!disabled && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 text-xs text-muted-foreground"
          onClick={handleAddSection}
        >
          <i className="ri-add-line mr-1.5" />
          <Trans>Add Section</Trans>
        </Button>
      )}
    </div>
  );
}

interface SectionItemProps {
  disabled: boolean;
  item: ReorderItem & { id: string };
  onChange: (item: ReorderItem & { id: string }) => void;
  onDelete: (itemId: string) => void;
  dragControls: any;
}

export function SectionItem({ disabled, item, onChange, onDelete, dragControls }: SectionItemProps) {
  const { t } = useLingui();

  const handleChangeTitle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...item, title: e.target.value });
    },
    [item, onChange],
  );

  const handleChangeDescription = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange({ ...item, description: e.target.value });
    },
    [item, onChange],
  );

  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  return (
    <div className="group relative flex items-stretch gap-0 rounded-lg border border-transparent transition-colors hover:border-border/50">
      {/* Subtle left accent */}
      <div className="w-0.5 shrink-0 rounded-l-lg bg-border/60" />

      {!disabled && (
        <button
          className="flex w-5 shrink-0 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-40 hover:!opacity-70 active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <i className="ri-draggable text-xs text-muted-foreground" />
        </button>
      )}

      <div className={`flex-1 py-2 pr-6 ${disabled ? "pl-3" : "pl-0"}`}>
        <Input
          readOnly={disabled}
          value={item.title}
          onChange={handleChangeTitle}
          placeholder={t`Section title`}
          className={`h-auto border-0 bg-transparent p-0 text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50 ${
            disabled ? "pointer-events-none" : ""
          }`}
        />
        <Textarea
          readOnly={disabled}
          value={item.description}
          onChange={handleChangeDescription}
          placeholder={t`Description`}
          className={`min-h-[20px] resize-none border-0 bg-transparent p-0 text-xs leading-relaxed text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40 ${
            disabled ? "pointer-events-none" : ""
          }`}
        />
      </div>

      {!disabled && (
        <button
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-40 hover:!opacity-100 hover:text-destructive"
          onClick={handleDelete}
        >
          <i className="ri-close-line text-xs" />
        </button>
      )}
    </div>
  );
}
