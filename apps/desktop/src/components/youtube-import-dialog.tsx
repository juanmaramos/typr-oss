import { Trans } from "@lingui/macro";
import { AlertCircle } from "lucide-react";

import { Loader } from "@/components/ui/loader";
import { useYouTubeImport } from "@/hooks/useYouTubeImport";
import { Button } from "@typr/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@typr/ui/components/ui/dialog";
import { Input } from "@typr/ui/components/ui/input";
import { Label } from "@typr/ui/components/ui/label";

interface YouTubeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoEnhance?: boolean;
}

export function YouTubeImportDialog({ open, onOpenChange, autoEnhance = true }: YouTubeImportDialogProps) {
  const {
    url,
    setUrl,
    error,
    isLoading,
    handleSubmit,
    handleReset,
    canSubmit,
    isValidUrl,
  } = useYouTubeImport({
    onSuccess: () => onOpenChange(false),
    autoEnhance,
  });

  const handleClose = () => {
    if (!isLoading) {
      onOpenChange(false);
      handleReset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left">
            <Trans>Transcribe YouTube Video</Trans>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="youtube-url">
              <Trans>YouTube URL</Trans>
            </Label>
            <Input
              id="youtube-url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              autoFocus
              className={!isValidUrl ? "border-destructive" : ""}
            />
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isLoading
                ? (
                  <>
                    <Loader className="mr-2 h-4 w-4" />
                    <Trans>Importing...</Trans>
                  </>
                )
                : <Trans>Import Video</Trans>}
            </Button>
          </div>
        </form>

        {isLoading && (
          <div className="text-center text-sm text-muted-foreground">
            <Trans>This may take a few seconds...</Trans>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
