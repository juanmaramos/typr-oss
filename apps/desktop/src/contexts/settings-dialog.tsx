import type { Tab } from "@/components/settings/components/types";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

export type SettingsDialogAction = "new-template";
export type AISettingsSection = "transcription" | "chat";

interface SettingsDialogContextType {
  open: boolean;
  activeTab: Tab;
  activeAiSection: AISettingsSection;
  pendingAction: SettingsDialogAction | null;
  openDialog: (tab?: Tab, action?: SettingsDialogAction | null, aiSection?: AISettingsSection) => void;
  closeDialog: () => void;
  setActiveTab: (tab: Tab) => void;
  setActiveAiSection: (section: AISettingsSection) => void;
  setOpen: (open: boolean) => void;
  consumePendingAction: () => void;
}

const SettingsDialogContext = createContext<SettingsDialogContextType | null>(
  null,
);

export function SettingsDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [activeAiSection, setActiveAiSection] = useState<AISettingsSection>("transcription");
  const [pendingAction, setPendingAction] = useState<SettingsDialogAction | null>(null);

  const openDialog = useCallback((tab?: Tab, action?: SettingsDialogAction | null, aiSection?: AISettingsSection) => {
    if (tab) {
      setActiveTab(tab);
    }
    if (aiSection) {
      setActiveAiSection(aiSection);
    }
    setPendingAction(action ?? null);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
  }, []);

  const consumePendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  // Register Cmd+, keyboard shortcut
  useHotkeys(
    "mod+,",
    (event) => {
      event.preventDefault();
      openDialog();
    },
    {
      splitKey: "!",
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  // Listen for custom event from openSettingsWindow utility
  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tab?: Tab;
        action?: SettingsDialogAction | null;
        aiSection?: AISettingsSection;
      }>;
      openDialog(customEvent.detail.tab, customEvent.detail.action, customEvent.detail.aiSection);
    };

    window.addEventListener("open-settings-dialog", handleOpenSettings);
    return () => window.removeEventListener("open-settings-dialog", handleOpenSettings);
  }, [openDialog]);

  return (
    <SettingsDialogContext.Provider
      value={{
        open,
        activeTab,
        activeAiSection,
        pendingAction,
        openDialog,
        closeDialog,
        setActiveTab,
        setActiveAiSection,
        setOpen,
        consumePendingAction,
      }}
    >
      {children}
    </SettingsDialogContext.Provider>
  );
}

export function useSettingsDialog() {
  const context = useContext(SettingsDialogContext);
  if (!context) {
    throw new Error(
      "useSettingsDialog must be used within SettingsDialogProvider",
    );
  }
  return context;
}
