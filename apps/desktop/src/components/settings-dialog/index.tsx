import { useSettingsDialog } from "@/contexts/settings-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@typr/ui/components/ui/dialog";
import { SidebarProvider } from "@typr/ui/components/ui/sidebar";
import { SettingsDialogContent } from "./content";
import { SettingsDialogSidebar } from "./sidebar";

export function SettingsDialog() {
  const { open, closeDialog } = useSettingsDialog();

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="overflow-hidden p-0 gap-0 flex h-[85vh] max-h-[85vh] w-[calc(100vw-4rem)] max-w-[1100px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings here.
        </DialogDescription>
        <SidebarProvider className="items-start h-full flex-1 min-h-0">
          <SettingsDialogSidebar />
          <SettingsDialogContent />
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
