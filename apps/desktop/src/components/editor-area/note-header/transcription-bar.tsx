import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PlayerControls } from "./player-controls";

import { Icon } from "@/components/ui/icon";
import { TemplateIcon } from "@/components/ui/template-icon";
import { useTypr, useRightPanel } from "@/contexts";
import { useEnhancePendingState } from "@/hooks/enhance-pending";
import { useModelState } from "@/hooks/useModelState";
import { useConsentNotification } from "@/utils/consent-notification";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { TemplateService } from "@/utils/template-service";
import { commands as configCommands } from "@typr/plugin-config";
import { commands as listenerCommands } from "@typr/plugin-listener";
import { commands as localSttCommands } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { ButtonGroup, buttonGroupItemVariants, ButtonGroupSeparator } from "@typr/ui/components/ui/button-group";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { Switch } from "@typr/ui/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSession } from "@typr/utils/contexts";

// STT Components
import { LANGUAGE_OPTIONS } from "../../transcript/constants/languageData";
import { useSTTModel } from "../../transcript/hooks/useSTTModel";
import { useTranscriptState } from "../../transcript/hooks/useTranscriptState";

export default function TranscriptionBar({
  sessionId,
  className,
  onOpenTranscript,
}: {
  sessionId: string;
  className?: string;
  onOpenTranscript?: () => void;
}) {
  const { t } = useLingui();
  const { onboardingSessionId } = useTypr();
  const isOnboarding = sessionId === onboardingSessionId;
  const { showSidebar } = useRightPanel();

  // Single source of truth for STT model availability (event-driven, always fresh)
  const { isSttModelAvailable, isSttLoading, isDownloaded } = useModelState();

  // Check if any STT model exists (for onboarding only)
  const supportedModelsQuery = useQuery({
    queryKey: ["supported-stt-models"],
    queryFn: () => localSttCommands.listSupportedModels(),
    staleTime: 60 * 1000,
    enabled: isOnboarding,
  });

  const anySttModelExists = {
    data: isOnboarding && supportedModelsQuery.data
      ? supportedModelsQuery.data.some(model => isDownloaded(model.toString()))
      : false,
    isLoading: supportedModelsQuery.isLoading,
  };

  const ongoingSessionStatus = useOngoingSession((s) => s.status);
  const ongoingSessionId = useOngoingSession((s) => s.sessionId);
  const ongoingSessionStore = useOngoingSession((s) => ({
    start: s.start,
    resume: s.resume,
    pause: s.pause,
    stop: s.stop,
    loading: s.loading,
    setAutoEnhanceTemplate: s.setAutoEnhanceTemplate,
  }));

  // const sessionWords = useSession(ongoingSessionId || sessionId, (s) => s.session.words);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const showConsentNotification = useConsentNotification();

  // Get config for consent notification setting
  const config = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const general = await configCommands.getGeneralConfig();
      return { general };
    },
  });

  const isEnhancePending = useEnhancePendingState(sessionId);
  const nonEmptySession = useSession(
    sessionId,
    (s) => !!(s.session.words.length > 0 || s.session.enhanced_memo_html),
  );
  const meetingEnded = isEnhancePending || nonEmptySession;

  const handleStartSession = () => {
    if (ongoingSessionStatus === "inactive") {
      ongoingSessionStore.start(sessionId);

      // Show consent notification if enabled in settings
      if (!isOnboarding && config.data?.general.show_consent_notification) {
        showConsentNotification();
      }

      // Set mic muted after starting if it's onboarding
      if (isOnboarding) {
        listenerCommands.setMicMuted(true);
      }

      if (onOpenTranscript) {
        onOpenTranscript();
      } else {
        showSidebar("transcript");
      }
    }
  };

  const handleDirectPause = async () => {
    console.log("⏸️ [PAUSE_UI] Pause button clicked!");
    console.log("⏸️ [PAUSE_UI] Setting loading=true");
    try {
      await listenerCommands.pauseSession();
      console.log("✅ [PAUSE_UI] pauseSession completed");
    } catch (error) {
      console.error("[PAUSE_UI] Error:", error);
    }
  };

  const handleDirectResume = async () => {
    console.log("🔄 [RESUME_UI] Resume button clicked!");
    console.log("🔄 [RESUME_UI] Setting loading=true");
    try {
      await listenerCommands.resumeSession();
      console.log("✅ [RESUME_UI] resumeSession completed");
    } catch (error) {
      console.error("[RESUME_UI] Error:", error);
    }
  };

  const handleDirectStop = async () => {
    console.log("🛑 [STOP_UI] Stop button clicked!");
    console.log("🛑 [STOP_UI] Setting loading=true");
    try {
      await listenerCommands.stopSession();
      console.log("✅ [STOP_UI] stopSession completed");
    } catch (error) {
      console.error("[STOP_UI] Error:", error);
    }
  };

  const isActiveSession = ongoingSessionStatus !== "inactive" && sessionId === ongoingSessionId;

  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-all duration-200 flex-shrink-0",
        className,
      )}
      role="group"
      aria-label={t`Transcription controls`}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        {ongoingSessionStatus === "inactive" && (
          <ButtonGroup>
            <Button
              size="sm"
              variant="secondary"
              className={cn(
                buttonGroupItemVariants({ orientation: "horizontal" }),
                "gap-2 text-[13px] font-medium",
              )}
              onClick={handleStartSession}
              disabled={isSttLoading
                || (isOnboarding
                  ? !anySttModelExists.data || (meetingEnded && isEnhancePending)
                  : !isSttModelAvailable || (meetingEnded && isEnhancePending))}
            >
              {isSttLoading
                ? <i className="ri-loader-4-line text-sm animate-spin" />
                : (
                  <i
                    className={meetingEnded
                      ? "ri-play-fill text-sm text-foreground"
                      : "ri-voice-ai-line text-sm text-foreground"}
                  />
                )}
              {meetingEnded ? <Trans>Resume</Trans> : <Trans>Transcribe</Trans>}
            </Button>
            <ButtonGroupSeparator />
            <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className={cn(
                        "rounded-md rounded-l-none w-9 p-0",
                      )}
                      disabled={isSttLoading
                        || (isOnboarding
                          ? !anySttModelExists.data || (meetingEnded && isEnhancePending)
                          : !isSttModelAvailable || (meetingEnded && isEnhancePending))}
                    >
                      {isSettingsOpen
                        ? <ChevronUpIcon className="h-4 w-4" />
                        : <ChevronDownIcon className="h-4 w-4" />}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>
                    <Trans>More settings</Trans>
                  </p>
                </TooltipContent>
              </Tooltip>
              <PopoverContent className="w-80" align="end">
                <AdvancedRecordingControls
                  sessionId={sessionId}
                />
              </PopoverContent>
            </Popover>
          </ButtonGroup>
        )}

        {(ongoingSessionStatus === "running_active" || ongoingSessionStatus === "running_paused") && isActiveSession
          && (
            <div>
              <div>
                <PlayerControls
                  sessionId={sessionId}
                  onPause={handleDirectPause}
                  onResume={handleDirectResume}
                  onStop={handleDirectStop}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function AdvancedRecordingControls({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t } = useLingui();
  const { onboardingSessionId } = useTypr();
  const ongoingSessionState = useOngoingSession((s) => ({
    micMuted: s.micMuted,
    speakerMuted: s.speakerMuted,
    status: s.status,
    sessionId: s.sessionId,
  }));

  const ongoingSessionStore = useOngoingSession((s) => ({
    setAutoEnhanceTemplate: s.setAutoEnhanceTemplate,
  }));
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");

  // Get disabled state for STT model selector
  const { isLanguageChangeable } = useTranscriptState(sessionId);
  const { isChanging } = useSTTModel();

  const toggleMicMuted = useMutation({
    mutationFn: async () => {
      await listenerCommands.setMicMuted(!ongoingSessionState.micMuted);
    },
  });

  const toggleSpeakerMuted = useMutation({
    mutationFn: async () => {
      await listenerCommands.setSpeakerMuted(!ongoingSessionState.speakerMuted);
    },
  });

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const general = await configCommands.getGeneralConfig();
      return { general };
    },
    refetchOnWindowFocus: false,
    staleTime: 60000, // Config changes infrequently
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => TemplateService.getAllTemplates(),
    refetchOnWindowFocus: false,
    staleTime: 60000, // Templates change infrequently
  });

  useEffect(() => {
    if (configQuery.data?.general?.selected_template_id) {
      setSelectedTemplate(configQuery.data.general.selected_template_id);
    } else {
      setSelectedTemplate("auto");
    }
  }, [configQuery.data]);

  const handleTemplateChange = (newTemplate: string) => {
    setSelectedTemplate(newTemplate);
    // Directly update the ongoing session's auto enhance template
    const actualTemplateId = newTemplate === "auto" ? null : newTemplate;
    ongoingSessionStore.setAutoEnhanceTemplate(actualTemplateId);
  };

  return (
    <div className="space-y-6 p-1">
      {/* Sources Section */}
      <div>
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-3">
            <Trans>Sources</Trans>
          </h4>
          <div className="space-y-4">
            <div>
              <div className="mb-3">
                <span className="text-sm font-medium">
                  <Trans>Your voice</Trans>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  size="sm"
                  checked={!ongoingSessionState.micMuted}
                  onCheckedChange={() => toggleMicMuted.mutate()}
                  disabled={sessionId === onboardingSessionId || ongoingSessionState.status === "running_active"}
                />
                <span className="text-sm text-muted-foreground">
                  <Trans>{!ongoingSessionState.micMuted ? "Transcribe" : "Don't transcribe"}</Trans>
                </span>
              </div>
            </div>

            <div>
              <div className="mb-3">
                <span className="text-sm font-medium">
                  <Trans>Other's voice</Trans>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  size="sm"
                  checked={!ongoingSessionState.speakerMuted}
                  onCheckedChange={() => toggleSpeakerMuted.mutate()}
                  disabled={ongoingSessionState.status === "running_active"}
                />
                <span className="text-sm text-muted-foreground">
                  <Trans>{!ongoingSessionState.speakerMuted ? "Transcribe" : "Don't transcribe"}</Trans>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning when both voice sources are disabled */}
        {ongoingSessionState.micMuted && ongoingSessionState.speakerMuted && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 mb-4">
            <i className="ri-error-warning-line text-warning text-xs flex-shrink-0" />
            <span className="text-xs text-warning font-medium">
              <Trans>Enable at least one voice source to capture audio</Trans>
            </span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            <Trans>Audio input</Trans>
          </label>
          <MicrophoneDropdown
            disabled={sessionId === onboardingSessionId}
          />
        </div>
      </div>

      {/* Transcription Model Section */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          <Trans>Transcription model</Trans>
        </label>
        <STTModelDropdown
          disabled={sessionId === onboardingSessionId || !isLanguageChangeable || isChanging}
        />
      </div>

      {/* Template Section */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          <Trans>Summary template</Trans>
        </label>
        <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              <span className="truncate">
                {selectedTemplate === "auto" || !selectedTemplate
                  ? t`Auto`
                  : getTemplateDisplayName(
                    templatesQuery.data?.find(t => t.id === selectedTemplate)?.title,
                    t`Auto`,
                  )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-44 overflow-y-auto w-[var(--radix-select-trigger-width)]">
            <SelectItem value="auto">
              <div className="flex items-center gap-2">
                <Icon name="ri-sparkling-line" className="h-4 w-4" />
                <Trans>Auto</Trans>
              </div>
            </SelectItem>
            {templatesQuery.data?.map((template) => {
              const title = getTemplateDisplayName(template.title, "Untitled");
              const truncatedTitle = title.length > 20 ? title.substring(0, 20) + "..." : title;

              return (
                <SelectItem key={template.id} value={template.id} className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <TemplateIcon template={template} className="h-4 w-4" />
                    <span className="truncate">{truncatedTitle}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function MicrophoneDropdown({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const AUTO_MICROPHONE_VALUE = "__system_default_auto__";

  const allDevicesQuery = useQuery({
    queryKey: ["microphone", "devices"],
    queryFn: () => listenerCommands.listMicrophoneDevices(),
  });

  const currentDeviceQuery = useQuery({
    queryKey: ["microphone", "current-device"],
    queryFn: () => listenerCommands.getCurrentMicrophoneDevice(),
  });

  const selectionModeQuery = useQuery({
    queryKey: ["microphone", "selection-mode"],
    queryFn: () => listenerCommands.getMicrophoneSelectionMode(),
  });

  const isAutoMode = selectionModeQuery.data !== "manual";
  const selectedValue = isAutoMode ? AUTO_MICROPHONE_VALUE : (currentDeviceQuery.data || "");
  const autoDeviceLabel = currentDeviceQuery.data
    ? `${t`System Default (Auto)`} - ${currentDeviceQuery.data}`
    : t`System Default (Auto)`;

  const handleSelectDevice = (device: string) => {
    const update = device === AUTO_MICROPHONE_VALUE
      ? listenerCommands.setMicrophoneAuto()
      : listenerCommands.setMicrophoneDevice(device);

    update.then(() => {
      currentDeviceQuery.refetch();
      selectionModeQuery.refetch();
    });
  };

  return (
    <Select
      value={selectedValue}
      onValueChange={handleSelectDevice}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          <span className="truncate">
            {isAutoMode ? autoDeviceLabel : (currentDeviceQuery.data || t`Select microphone...`)}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-48 overflow-y-auto">
        <SelectItem value={AUTO_MICROPHONE_VALUE}>
          {autoDeviceLabel}
        </SelectItem>
        {allDevicesQuery.isLoading
          ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground/50 mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading devices...</p>
            </div>
          )
          : allDevicesQuery.data?.length === 0
          ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No microphones found</p>
            </div>
          )
          : (
            allDevicesQuery.data?.map((device) => (
              <SelectItem key={device} value={device}>
                <span className="truncate">{device}</span>
              </SelectItem>
            ))
          )}
      </SelectContent>
    </Select>
  );
}

function STTModelDropdown({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { selectedLanguage, handleLanguageChange } = useSTTModel();
  const { t } = useLingui();

  // Helper function to get translated model labels
  const getTranslatedLabel = (key: string) => {
    switch (key) {
      case "balanced":
        return t`Multilingual`;
      case "english":
        return t`English high accuracy`;
      case "multilingual":
        return t`Multilingual high accuracy`;
      case "assemblyai-universal":
        return t`Real-time Universal`;
      default:
        return key;
    }
  };

  const handleSelect = (optionKey: string) => {
    handleLanguageChange(optionKey as any);
  };

  const selectedOption = LANGUAGE_OPTIONS.find(option => option.key === selectedLanguage);
  const displayLabel = selectedOption ? getTranslatedLabel(selectedOption.key) : t`Select model`;

  return (
    <Select
      value={selectedLanguage}
      onValueChange={handleSelect}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          <div className="flex items-center justify-between w-full">
            <span className="truncate">{displayLabel}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-48 overflow-y-auto" side="top">
        {LANGUAGE_OPTIONS.filter(option => !("hidden" in option) || !option.hidden).map((option) => (
          <SelectItem key={option.key} value={option.key}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <i className={option.iconClass} />
                <span className="truncate">{getTranslatedLabel(option.key)}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
