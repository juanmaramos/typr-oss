import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands } from "@typr/plugin-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatch, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { type as getOsType } from "@tauri-apps/plugin-os";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { ContextPane } from "@/components/app-shell/context-pane";
import { PrimaryRail } from "@/components/app-shell/primary-rail";
import { SHELL_CHROME_MAC_LEADING_INSET_CLASS } from "@/components/app-shell/titlebar-layout";
import { PANEL_HANDLE_TRANSITION } from "@/components/app-shell/transitions";
import { ProjectKnowledgeJobRunner } from "@/components/projects/project-knowledge-job-runner";
import RightPanel from "@/components/right-panel";
import { useShowRightSidebar } from "@/components/right-panel/hooks/useShowRightSidebar";
import { SettingsDialog } from "@/components/settings-dialog";
import type { Tab } from "@/components/settings/components/types";
import { ShortcutsProvider } from "@/components/shortcuts-window";
import Notifications from "@/components/toast";
import Toolbar from "@/components/toolbar";
import { LeftSidebarButton } from "@/components/toolbar/buttons/left-sidebar-button";
import { ProjectBriefSidebarButton } from "@/components/toolbar/buttons/project-brief-sidebar-button";
import { RightSidebarButton } from "@/components/toolbar/buttons/right-sidebar-button";
import { WelcomeModal } from "@/components/welcome-modal";
import {
  DiffActionsProvider,
  EditModeProvider,
  LayoutProvider,
  NewChatProvider,
  NewNoteProvider,
  SearchProvider,
  useTypr,
  useLeftSidebar,
  useRightPanel,
  YouTubeImportProvider,
} from "@/contexts";
import { AudioUploadProvider } from "@/contexts/audio-upload";
import { BackgroundEnhanceWorker } from "@/contexts/background-enhance";
import { NoteActionsProvider } from "@/contexts/note-actions";
import { SettingsDialogProvider, useSettingsDialog } from "@/contexts/settings-dialog";
import { TranscriptionControlProvider } from "@/contexts/transcription-control";

import { useTranscriptionFallback } from "@/hooks/useTranscriptionFallback";
import { FEATURES } from "@/lib/features";
import { commands } from "@/types";
import { events as windowsEvents, getCurrentWebviewWindowLabel } from "@typr/plugin-windows";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@typr/ui/components/ui/resizable";
import { cn } from "@typr/ui/lib/utils";
import { AUTO_CLOUD_MODEL_ID, LEGACY_WINDOWS_DEFAULT_CLOUD_MODEL_ID } from "@typr/utils";
import { OngoingSessionProvider, SessionsProvider } from "@typr/utils/contexts";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

// Schema for deep link query parameters
const searchSchema = z.object({
  settingsDialog: z.coerce.boolean().optional(),
  settingsTab: z.enum([
    "general",
    "profile",
    "privacy",
    "calendar",
    "ai",
    "notifications",
    "sound",
    "templates",
    "integrations",
    "about",
  ]).optional(),
  settingsSection: z.enum(["transcription", "chat"]).optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

export const Route = createFileRoute("/app")({
  component: Component,
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context: { sessionsStore, ongoingSessionStore } }) => {
    const isOnboardingNeeded = await commands.isOnboardingNeeded();
    return { sessionsStore, ongoingSessionStore, isOnboardingNeeded };
  },
});

function Component() {
  const router = useRouter();
  const { thankYouSessionId } = useTypr();
  const { sessionsStore, ongoingSessionStore, isOnboardingNeeded } = Route.useLoaderData();
  const queryClient = useQueryClient();

  const [onboardingCompletedThisSession, setOnboardingCompletedThisSession] = useState(false);

  // Suppress unused variable warning - this is used for future onboarding logic
  void onboardingCompletedThisSession;

  const windowLabel = getCurrentWebviewWindowLabel();
  const isMain = windowLabel === "main";
  const showNotifications = isMain && !isOnboardingNeeded;

  const shouldShowWelcomeModal = isMain && isOnboardingNeeded;
  const openWelcomeNote = useCallback(async ({ invalidate = true }: { invalidate?: boolean } = {}) => {
    await commands.ensureWelcomeNote();

    if (thankYouSessionId) {
      const session = await dbCommands.getSession({ id: thankYouSessionId });
      if (session) {
        sessionsStore.getState().insert(session);
      }
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      router.navigate({ to: `/app/note/${thankYouSessionId}` });
    }

    if (invalidate) {
      router.invalidate();
    }
  }, [queryClient, router, sessionsStore, thankYouSessionId]);

  return (
    <>
      <SessionsProvider store={sessionsStore}>
        <OngoingSessionProvider store={ongoingSessionStore}>
          <LayoutProvider>
            <InitializeDefaultModels />
            <TranscriptionFallbackBridge />
            <MainWindowStateEventSupport />
            <ShortcutsProvider>
              <SettingsDialogProvider>
                <YouTubeImportProvider>
                  <AudioUploadProvider>
                    <BackgroundEnhanceWorker>
                      <ProjectKnowledgeJobRunner />
                      <DeepLinkHandler />
                      <NewChatProvider>
                        <NewNoteProvider>
                          <SearchProvider>
                            <NoteActionsProvider>
                              <TranscriptionControlProvider>
                                <DiffActionsProvider>
                                  <EditModeProvider>
                                    <div className="relative flex h-screen w-screen overflow-hidden bg-sidebar p-[6px]">
                                      <ShellChrome />
                                      {FEATURES.SHOW_PRIMARY_RAIL && <PrimaryRail />}
                                      <ContextPane />
                                      <MainPanelGroup />
                                    </div>
                                    <WelcomeModal
                                      isOpen={shouldShowWelcomeModal}
                                      onBackgroundSetupStart={() => openWelcomeNote({ invalidate: false })}
                                      onClose={async () => {
                                        setOnboardingCompletedThisSession(true);
                                        await openWelcomeNote();
                                      }}
                                    />
                                    <SettingsDialog />
                                  </EditModeProvider>
                                </DiffActionsProvider>
                              </TranscriptionControlProvider>
                            </NoteActionsProvider>
                          </SearchProvider>
                        </NewNoteProvider>
                      </NewChatProvider>
                    </BackgroundEnhanceWorker>
                  </AudioUploadProvider>
                </YouTubeImportProvider>
              </SettingsDialogProvider>
            </ShortcutsProvider>
          </LayoutProvider>
        </OngoingSessionProvider>
      </SessionsProvider>
      {showNotifications && <Notifications />}
    </>
  );
}

function MainPanelGroup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelGroupWidth, setPanelGroupWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPanelGroupWidth(Math.round(el.getBoundingClientRect().width));
    });
    setPanelGroupWidth(Math.round(el.getBoundingClientRect().width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="ml-px flex-1 overflow-hidden rounded-xl border border-sidebar-border bg-background"
    >
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full"
      >
        <ResizablePanel id="main-content" order={1} className="flex flex-col overflow-hidden">
          <Toolbar />
          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
        </ResizablePanel>
        <RightPanelResizeHandle />
        <RightPanel panelGroupWidth={panelGroupWidth} />
      </ResizablePanelGroup>
    </div>
  );
}

function ShellChrome() {
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });
  const isMain = getCurrentWebviewWindowLabel() === "main";
  const isNote = !!useMatch({ from: "/app/note/$id", shouldThrow: false });
  const isProject = !!useMatch({ from: "/app/projects/$projectId", shouldThrow: false });

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "pointer-events-none absolute left-[6px] right-[6px] top-[6px] z-20 flex h-11 items-center justify-between",
        osType.data === "macos" ? SHELL_CHROME_MAC_LEADING_INSET_CLASS : "pl-2",
      )}
    >
      <div className="pointer-events-auto">
        <LeftSidebarButton />
      </div>
      {isMain && isNote && (
        <div className="pointer-events-auto pr-2">
          <RightSidebarButton />
        </div>
      )}
      {isMain && isProject && (
        <div className="pointer-events-auto pr-2">
          <ProjectBriefSidebarButton />
        </div>
      )}
    </div>
  );
}

function RightPanelResizeHandle() {
  const show = useShowRightSidebar();
  const isMain = getCurrentWebviewWindowLabel() === "main";

  if (!isMain || !show) {
    return null;
  }

  return (
    <ResizableHandle
      withHandle
      className={cn(
        "cursor-col-resize bg-border/40 hover:bg-border/60 focus-visible:bg-border after:w-1 data-[panel-group-direction=vertical]:cursor-row-resize [&>div]:h-4 [&>div]:w-4 [&>div]:rounded-full [&>div]:border [&>div]:bg-background [&>div]:opacity-50 [&>div]:scale-90 [&>div]:shadow-2xs [&>div]:transition-all [&>div]:duration-150 hover:[&>div]:opacity-80 hover:[&>div]:scale-100 focus-visible:[&>div]:opacity-100 focus-visible:[&>div]:scale-100 [&>div>svg]:h-3 [&>div>svg]:w-3 [&>div>svg]:text-muted-foreground",
        PANEL_HANDLE_TRANSITION,
      )}
    />
  );
}

function TranscriptionFallbackBridge() {
  useTranscriptionFallback();
  return null;
}

function InitializeDefaultModels() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const initializeModels = async () => {
      try {
        const osType = await getOsType();
        const currentSttModel = await connectorCommands.getSttModel().catch(() => "");

        // Only on Windows, ensure cloud models are set
        if (osType === "windows") {
          // Force cloud STT model on Windows if local model is set or empty
          const isLocalSttModel = !currentSttModel || !currentSttModel.includes("assemblyai");

          if (isLocalSttModel) {
            await connectorCommands.setSttModel("assemblyai-universal");
            queryClient.invalidateQueries({ queryKey: ["stt-model-connector"] });
          }

          const currentLlmModel = await connectorCommands.getCloudModel().catch(() => "");

          // Force cloud Auto when no model is configured or a legacy default is still stored.
          if (
            !currentLlmModel
            || currentLlmModel === "groq-openai/gpt-oss-20b"
            || currentLlmModel === LEGACY_WINDOWS_DEFAULT_CLOUD_MODEL_ID
          ) {
            await connectorCommands.setCloudModel(AUTO_CLOUD_MODEL_ID);

            // Invalidate queries to update UI immediately
            queryClient.invalidateQueries({ queryKey: ["cloud-model"] });
            queryClient.invalidateQueries({ queryKey: ["models"] });
          }
        }
      } catch (error) {
        console.error("[Model Init] Failed to initialize default models:", error);
      }
    };

    initializeModels();
  }, [queryClient]);

  return null;
}

function MainWindowStateEventSupport() {
  const { setIsExpanded: setLeftSidebarExpanded } = useLeftSidebar();
  const { setIsExpanded: setRightPanelExpanded } = useRightPanel();

  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    windowsEvents.mainWindowState(currentWindow).listen(({ payload }) => {
      if (payload.left_sidebar_expanded !== null) {
        setLeftSidebarExpanded(payload.left_sidebar_expanded);
      }

      if (payload.right_panel_expanded !== null) {
        setRightPanelExpanded(payload.right_panel_expanded);
      }
    });
  }, []);

  return null;
}

function DeepLinkHandler() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/app" });
  const { openDialog } = useSettingsDialog();
  const [hasHandledDeepLink, setHasHandledDeepLink] = React.useState(false);

  useEffect(() => {
    // Only run once on mount when deep link params are present
    const hasParams = search.settingsDialog || search.baseUrl;

    if (!hasParams || hasHandledDeepLink) {
      return;
    }

    const handleDeepLinkParams = async () => {
      setHasHandledDeepLink(true);

      // Handle API configuration from deep link
      if (search.baseUrl && search.apiKey) {
        try {
          await connectorCommands.setCustomLlmConnection({
            api_base: search.baseUrl,
            api_key: search.apiKey,
          });
          await connectorCommands.setCustomLlmEnabled(true);
        } catch (error) {
          console.error("Failed to configure custom LLM from deep link:", error);
        }
      }

      // Open settings dialog if requested
      if (search.settingsDialog) {
        const tab = (search.settingsTab as Tab) || "general";
        openDialog(tab, null, search.settingsSection);

        // Clean up URL by removing query parameters AFTER a small delay
        // This prevents the effect from re-triggering
        setTimeout(() => {
          navigate({
            to: "/app",
            search: {},
            replace: true,
          });
        }, 100);
      }
    };

    handleDeepLinkParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  return null;
}
