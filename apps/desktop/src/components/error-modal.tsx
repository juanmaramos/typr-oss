import { relaunch } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import { MessageSquareIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { Modal, ModalBody, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@typr/ui/components/ui/modal";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: Error;
}

export function ErrorModal({ isOpen, onClose, error }: ErrorModalProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to refresh app:", err);
      // Fallback to window reload
      window.location.reload();
    }
  };

  const handleReportFeedback = () => {
    // Placeholder for future email/Sentry integration
    // For now, redirect to GitHub issues
    open("https://github.com/juanmaramos/typr-oss/issues");
  };

  return (
    <Modal open={isOpen} onClose={onClose} size="md" preventClose>
      <ModalHeader className="px-6 pt-6">
        <ModalTitle>Something went wrong</ModalTitle>
        <ModalDescription className="mt-2">
          We encountered an unexpected error. The error has been automatically reported to our team.
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="py-4">
        {error && (
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium text-foreground mb-2">Error details:</p>
            <code className="text-muted-foreground break-words">
              {error.message || "Unknown error occurred"}
            </code>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button
          variant="default"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex-1"
        >
          <RefreshCwIcon className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh App"}
        </Button>

        <Button
          variant="outline"
          onClick={handleReportFeedback}
          className="flex-1"
        >
          <MessageSquareIcon className="h-4 w-4 mr-2" />
          Report Issue
        </Button>
      </ModalFooter>
    </Modal>
  );
}
