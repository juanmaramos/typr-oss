import { Button } from "@typr/ui/components/ui/button";
import { Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface SelectionToolbarProps {
  selectedCount: number;
  isDeleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}

export function SelectionToolbar({
  selectedCount,
  isDeleting,
  onCancel,
  onDelete,
}: SelectionToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="flex items-center justify-between bg-background/95 border backdrop-blur-sm rounded-lg p-2 shadow-sm mb-3"
      >
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-foreground">
            {selectedCount} selected
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isDeleting}
            className="h-7 px-2"
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-7 px-2"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Delete {selectedCount === 1 ? "note" : "notes"}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
