import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useTypr } from "@/contexts";

import { commands } from "@/types";
import { type SupportedModel as SupportedLlmModel } from "@typr/plugin-local-llm";
import { commands as localSttCommands, SupportedModel } from "@typr/plugin-local-stt";

import { Dialog, DialogContent, DialogTitle } from "@typr/ui/components/ui/dialog";

import { commands as configCommands } from "@typr/plugin-config";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as dbCommands } from "@typr/plugin-db";
import { AUTO_CLOUD_MODEL_ID } from "@typr/utils";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { AudioPermissionsView } from "./audio-permissions-view";
import { DownloadProgressView } from "./download-progress-view";
import {
  createOnboardingModelSetup,
  DEFAULT_ONBOARDING_LLM_MODEL,
  DEFAULT_ONBOARDING_STT_MODEL,
  restoreOnboardingModelSetup,
} from "./model-setup";
import { UserSetupView } from "./user-setup-view";
import { WelcomeView } from "./welcome-view";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBackgroundSetupStart?: () => void | Promise<void>;
}

type OnboardingStep = "user-setup" | "permissions" | "welcome" | "download-progress";

export function WelcomeModal({ isOpen, onClose, onBackgroundSetupStart }: WelcomeModalProps) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const { userId } = useTypr();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("user-setup");
  const [selectedSttModel, setSelectedSttModel] = useState<SupportedModel>(DEFAULT_ONBOARDING_STT_MODEL);
  const [selectedLlmModel, setSelectedLlmModel] = useState<SupportedLlmModel>(DEFAULT_ONBOARDING_LLM_MODEL);
  const [existingUserData, setExistingUserData] = useState<{ fullName?: string; displayLanguage?: string }>({});
  const didStartBackgroundSetup = useRef(false);

  const selectSTTModel = useMutation({
    mutationFn: (model: SupportedModel) => localSttCommands.setCurrentModel(model),
  });

  // Load existing onboarding data when modal opens
  useEffect(() => {
    if (!isOpen || !userId) {
      return;
    }

    const loadOnboardingState = async () => {
      try {
        // Load stored step
        const [storedStep, modelSetup] = await Promise.all([
          commands.getOnboardingStep(),
          commands.getOnboardingModelSetup(),
        ]);
        if (storedStep === "model-selection") {
          await commands.setOnboardingStep("welcome");
          setCurrentStep("welcome");
        } else if (
          storedStep
          && ["user-setup", "permissions", "welcome", "download-progress"].includes(storedStep)
        ) {
          setCurrentStep(storedStep as OnboardingStep);
        }

        const restoredModels = restoreOnboardingModelSetup(modelSetup);
        setSelectedSttModel(restoredModels.sttModel);
        setSelectedLlmModel(restoredModels.llmModel);

        // Load existing user data
        const [user, config] = await Promise.all([
          dbCommands.getHuman(userId),
          configCommands.getGeneralConfig(),
        ]);

        const userData: { fullName?: string; displayLanguage?: string } = {};

        if (user?.full_name) {
          userData.fullName = user.full_name;
        }

        if (config.display_language) {
          userData.displayLanguage = config.display_language;
        }

        setExistingUserData(userData);

        console.log("[Onboarding] Loaded existing data:", {
          step: storedStep,
          modelSetup,
          userData,
        });
      } catch (error) {
        console.error("[Onboarding] Failed to load existing data:", error);
      }
    };

    loadOnboardingState();
  }, [isOpen, userId]);

  // Removed background music/sound effects for cleaner onboarding

  useEffect(() => {
    if (!isOpen || currentStep !== "download-progress" || didStartBackgroundSetup.current) {
      return;
    }

    didStartBackgroundSetup.current = true;
    Promise.resolve(onBackgroundSetupStart?.()).catch((error) => {
      console.error("[Onboarding] Failed to open welcome note during background setup:", error);
    });
  }, [currentStep, isOpen, onBackgroundSetupStart]);

  const handleDownloadProgressContinue = async () => {
    await localSttCommands.setCurrentModel(selectedSttModel);
    await commands.setOnboardingModelSetup(createOnboardingModelSetup("complete", null, {
      sttModel: selectedSttModel,
      llmModel: selectedLlmModel,
    }));
    await commands.setOnboardingNeeded(false);
    await commands.setOnboardingStep("completed");
    onClose();
  };

  const handleUserSetupContinue = async (data: { fullName: string; displayLanguage: string }) => {
    // Save user data with empty spoken_languages (auto-detect default)
    try {
      const general = await configCommands.getGeneralConfig();
      await configCommands.setGeneralConfig({
        ...general,
        display_language: data.displayLanguage,
        spoken_languages: [], // Empty by default - auto-detect all languages
      });

      // Save user name to profile immediately
      await dbCommands.upsertHuman({
        id: userId!,
        full_name: data.fullName,
        is_user: true,
        organization_id: null,
        email: null,
        job_title: null,
        linkedin_username: null,
      });

      // Invalidate profile query to update UI immediately
      queryClient.invalidateQueries({ queryKey: ["config", "profile", userId] });

      // Activate the selected language immediately for onboarding UI
      i18n.activate(data.displayLanguage);

      console.log("[Onboarding] User data saved:", data);
    } catch (error) {
      console.error("[Onboarding] Failed to save user data:", error);
    }

    // Save step before moving to permissions (important for restart)
    await commands.setOnboardingStep("permissions");

    // Skip language selection - go straight to permissions
    setCurrentStep("permissions");
  };

  const handlePermissionsContinue = async () => {
    // Move to welcome screen after permissions
    await commands.setOnboardingStep("welcome");
    setCurrentStep("welcome");
  };

  const handleWelcomeContinue = async () => {
    // Check platform support for local models
    const osType = await getOsType();
    const isWindows = osType === "windows";

    if (isWindows) {
      // Windows: cloud chat + cloud STT are the required defaults for a usable first-run experience.
      await connectorCommands.setCloudModel(AUTO_CLOUD_MODEL_ID);
      await connectorCommands.setSttModel("assemblyai-universal");
      await commands.setOnboardingModelSetup(createOnboardingModelSetup("complete", null, {
        sttModel: selectedSttModel,
        llmModel: selectedLlmModel,
      }));
      await commands.setOnboardingNeeded(false);
      await commands.setOnboardingStep("completed");
      console.log("[Onboarding] Windows - Completed with cloud Auto default");
      onClose();
      return;
    }

    // macOS: local models are required for the free first-run experience.
    await selectSTTModel.mutateAsync(DEFAULT_ONBOARDING_STT_MODEL);
    setSelectedSttModel(DEFAULT_ONBOARDING_STT_MODEL);
    setSelectedLlmModel(DEFAULT_ONBOARDING_LLM_MODEL);
    await commands.setOnboardingModelSetup(createOnboardingModelSetup("pending", null, {
      sttModel: DEFAULT_ONBOARDING_STT_MODEL,
      llmModel: DEFAULT_ONBOARDING_LLM_MODEL,
    }));
    await commands.setOnboardingStep("download-progress");
    setCurrentStep("download-progress");
  };

  if (isOpen && currentStep === "download-progress") {
    return (
      <DownloadProgressView
        selectedSttModel={selectedSttModel}
        selectedLlmModel={selectedLlmModel}
        onContinue={handleDownloadProgressContinue}
      />
    );
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent
        overlayClassName="bg-black/20 backdrop-blur-none"
        className="w-[calc(100vw-2rem)] max-w-md gap-0 bg-background p-6"
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">
          <Trans>Welcome to Typr</Trans>
        </DialogTitle>
        <div className="flex flex-col items-center justify-center">
          {currentStep === "user-setup" && (
            <UserSetupView
              onContinue={handleUserSetupContinue}
              existingData={existingUserData}
            />
          )}
          {currentStep === "permissions" && (
            <AudioPermissionsView
              onContinue={handlePermissionsContinue}
            />
          )}
          {currentStep === "welcome" && (
            <WelcomeView
              onContinue={handleWelcomeContinue}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
