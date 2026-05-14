import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon, PauseIcon, PlayIcon, StopCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import SoundIndicator from "@/components/sound-indicator";
import { useTypr, useRightPanel } from "@/contexts";
import { useEnhancePendingState } from "@/hooks/enhance-pending";
// import { useConsentNotification } from "@/utils/consent-notification";
import { useMicrophoneDevice } from "@/components/transcript/hooks/useMicrophoneDevice";
import { Icon } from "@/components/ui/icon";
import { TemplateIcon } from "@/components/ui/template-icon";
import { useModelState } from "@/hooks/useModelState";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { TemplateService } from "@/utils/template-service";
import { commands as configCommands } from "@typr/plugin-config";
import { commands as listenerCommands } from "@typr/plugin-listener";
import { commands as localSttCommands } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { Separator } from "@typr/ui/components/ui/separator";
import { Spinner } from "@typr/ui/components/ui/spinner";
import { Switch } from "@typr/ui/components/ui/switch";
import { sonnerToast } from "@typr/ui/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@typr/ui/components/ui/tooltip";
import { cn } from "@typr/ui/lib/utils";
import { useOngoingSession, useSession } from "@typr/utils/contexts";
import { PlayerControls } from "./player-controls";
import ShinyButton from "./shiny-button";

export default function ListenButton({ sessionId }: { sessionId: string }) {
  const { onboardingSessionId } = useTypr();
  const isOnboarding = sessionId === onboardingSessionId;
  const { surface, showSidebar, openFloating } = useRightPanel();

  // ✅ FIXED: Replace polling with event-driven model state
  const { isDownloaded } = useModelState();

  // Get current model status
  const currentModelQuery = useQuery({
    queryKey: ["current-stt-model"],
    queryFn: () => localSttCommands.getCurrentModel(),
    staleTime: 60 * 1000, // Static data - cache for 1 minute
  });

  const modelDownloaded = {
    data: currentModelQuery.data ? isDownloaded(currentModelQuery.data.toString()) : false,
    isLoading: currentModelQuery.isLoading,
  };

  // Check if any STT model exists (for onboarding)
  const supportedModelsQuery = useQuery({
    queryKey: ["supported-stt-models"],
    queryFn: () => localSttCommands.listSupportedModels(),
    staleTime: 60 * 1000, // Static data - cache for 1 minute
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
  }));

  // Consent notification disabled - ListenButton is currently hidden, TranscriptionBar handles notifications
  // const showConsentNotification = useConsentNotification();

  // useEffect(() => {
  //   if (ongoingSessionStatus === "running_active" && sessionId === ongoingSessionId && !isOnboarding) {
  //     showConsentNotification();
  //   }
  // }, [ongoingSessionStatus, sessionId, ongoingSessionId, isOnboarding, showConsentNotification]);

  const isEnhancePending = useEnhancePendingState(sessionId);
  const nonEmptySession = useSession(
    sessionId,
    (s) => !!(s.session.words.length > 0 || s.session.enhanced_memo_html),
  );
  const meetingEnded = isEnhancePending || nonEmptySession;

  const handleStartSession = () => {
    if (ongoingSessionStatus === "inactive") {
      ongoingSessionStore.start(sessionId);

      // Consent notification disabled - handled by TranscriptionBar (this component is hidden)
      // if (!isOnboarding) {
      //   showConsentNotification();
      // }

      // Set mic muted after starting if it's onboarding
      if (isOnboarding) {
        listenerCommands.setMicMuted(true);
      }

      if (surface === "floating") {
        openFloating("transcript");
      } else {
        showSidebar("transcript");
      }
    }
  };

  const handleResumeSession = () => {
    ongoingSessionStore.resume();

    if (surface === "floating") {
      openFloating("transcript");
    } else {
      showSidebar("transcript");
    }
  };

  if (ongoingSessionStore.loading) {
    return (
      <div className="w-9 h-9 flex items-center justify-center">
        <Spinner color="black" />
      </div>
    );
  }

  if (ongoingSessionStatus === "running_paused" && sessionId === ongoingSessionId) {
    return (
      <Button
        disabled={!modelDownloaded.data}
        onClick={handleResumeSession}
        size="sm"
        variant="destructive"
        className={cn(
          "w-16 h-9 rounded-full transition-all hover:scale-95 outline-none p-0 flex items-center justify-center text-xs font-medium",
          "border-0 bg-destructive text-destructive-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.1)]",
        )}
      >
        <Trans>Resume</Trans>
      </Button>
    );
  }

  if (ongoingSessionStatus === "inactive") {
    const buttonProps = {
      disabled: isOnboarding
        ? !anySttModelExists.data || (meetingEnded && isEnhancePending)
        : !modelDownloaded.data || (meetingEnded && isEnhancePending),
      onClick: handleStartSession,
    };

    if (!meetingEnded) {
      return isOnboarding
        ? <WhenInactiveAndMeetingNotEndedOnboarding {...buttonProps} />
        : <WhenInactiveAndMeetingNotEnded {...buttonProps} />;
    } else {
      return isOnboarding
        ? <WhenInactiveAndMeetingEndedOnboarding {...buttonProps} />
        : <WhenInactiveAndMeetingEnded {...buttonProps} />;
    }
  }

  if (ongoingSessionStatus === "running_active") {
    if (sessionId !== ongoingSessionId) {
      return null;
    }

    return <WhenActive sessionId={sessionId} />;
  }
}

function WhenInactiveAndMeetingNotEnded({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="p-1.5">
          <Button
            disabled={disabled}
            onClick={onClick}
            variant={disabled ? "secondary" : "destructive"}
            size="icon"
            className={cn(
              "relative w-8 h-8 rounded-full transition-all",
              "flex items-center justify-center",
              "hover:scale-[1.02] active:scale-[0.98]",
              "ring-2 ring-border",
              "border-2",
              disabled ? "border-secondary/70" : "border-destructive/80",
            )}
            style={{
              touchAction: "manipulation",
            }}
          >
            <span className="absolute inset-0 -z-10 rounded-full w-full h-full" aria-hidden="true" />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <p>
          <Trans>Start recording</Trans>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function WhenInactiveAndMeetingEnded({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      size="sm"
      variant={isHovered ? "destructive" : "outline"}
      className={cn(
        "w-16 h-9 rounded-full transition-all outline-none p-0 flex items-center justify-center text-xs font-medium",
        "border border-input shadow-[0_0_0_1px_rgba(0,0,0,0.05)]",
        disabled ? "opacity-50" : "hover:scale-95",
        isHovered && !disabled
          ? "bg-destructive text-destructive-foreground border-0"
          : "bg-background text-foreground hover:bg-surface-400 hover:text-foreground",
      )}
    >
      <Trans>{disabled ? "Processing..." : isHovered ? "Resume" : "Stopped"}</Trans>
    </Button>
  );
}

function WhenInactiveAndMeetingNotEndedOnboarding({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <ShinyButton
      disabled={disabled}
      onClick={onClick}
      className={cn([
        "w-24 h-9 rounded-full border-2 transition-all cursor-pointer outline-none p-0 flex items-center justify-center gap-1",
        "bg-foreground/80 border-foreground/60 text-background text-xs font-medium",
        !disabled
          ? "hover:scale-95"
          : "opacity-50 cursor-progress",
      ])}
      style={{
        boxShadow: "0 0 0 2px hsl(var(--background) / 0.8) inset",
      }}
    >
      <PlayIcon size={14} />
      <Trans>{disabled ? "Wait..." : "Play video"}</Trans>
    </ShinyButton>
  );
}

function WhenInactiveAndMeetingEndedOnboarding({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant="secondary"
      className={cn(
        "w-28 h-9 rounded-full outline-none p-0 flex items-center justify-center gap-1 text-xs font-medium",
        "border-2 border-secondary/70 shadow-[0_0_0_2px_hsl(var(--background)/0.8)_inset]",
        disabled ? "opacity-50" : "hover:scale-95",
      )}
    >
      <PlayIcon size={14} />
      <Trans>{disabled ? "Processing..." : "Play again"}</Trans>
    </Button>
  );
}

function WhenActive({ sessionId }: { sessionId: string }) {
  const ongoingSessionId = useOngoingSession((s) => s.sessionId);
  const ongoingSessionStore = useOngoingSession((s) => ({
    pause: s.pause,
    resume: s.resume,
    stop: s.stop,
    setAutoEnhanceTemplate: s.setAutoEnhanceTemplate,
  }));
  const sessionWords = useSession(ongoingSessionId!, (s) => s.session.words);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleStopSession = (templateId?: string | null) => {
    if (templateId !== undefined) {
      ongoingSessionStore.setAutoEnhanceTemplate(templateId);
    }

    ongoingSessionStore.stop();
    setIsPopoverOpen(false);

    if (sessionWords.length === 0) {
      sonnerToast.dismiss("recording-consent-reminder");
    }
  };

  // Direct handlers for surface-level controls
  const handleDirectPause = () => {
    ongoingSessionStore.pause();
  };

  const handleDirectStop = () => {
    handleStopSession(); // Use default template behavior
  };

  const handleResumeSession = () => {
    ongoingSessionStore.resume();
  };

  return (
    <div className="p-1.5 space-y-4">
      {/* Original Controls */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 font-medium">Original</div>
        <div className="flex items-center gap-2">
          {/* Non-clickable dancing bars as status indicator */}
          <div className="flex items-center justify-center px-3 py-1.5 rounded-full bg-background border border-border shadow-sm">
            <SoundIndicator color="hsl(var(--muted-foreground))" size="long" />
          </div>

          {/* Direct control buttons */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDirectPause}
                className={cn(
                  "w-8 h-8 rounded-full transition-all",
                  "flex items-center justify-center",
                  "hover:scale-[1.02] active:scale-[0.98] hover:bg-surface-400",
                )}
              >
                <PauseIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                <Trans>Pause</Trans>
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDirectStop}
                className={cn(
                  "w-8 h-8 rounded-full transition-all",
                  "flex items-center justify-center",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <StopCircleIcon className="w-4 h-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                <Trans>Stop</Trans>
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Advanced settings dropdown */}
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      "flex items-center justify-center",
                      "hover:scale-[1.02] active:scale-[0.98] hover:bg-surface-400",
                      isPopoverOpen ? "scale-[0.98] bg-accent" : "",
                    )}
                  >
                    {isPopoverOpen
                      ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
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
                onStop={handleStopSession}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* New PlayerControls */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 font-medium">New Design</div>
        <PlayerControls
          sessionId={sessionId}
          onPause={async () => await handleDirectPause()}
          onResume={async () => await handleResumeSession()}
          onStop={async () => await handleDirectStop()}
        />
      </div>
    </div>
  );
}

function AdvancedRecordingControls({
  sessionId,
  onStop,
}: {
  sessionId: string;
  onStop: (templateId?: string | null) => void;
}) {
  const { onboardingSessionId } = useTypr();
  const { t } = useLingui();
  const ongoingSessionMuted = useOngoingSession((s) => ({
    micMuted: s.micMuted,
    speakerMuted: s.speakerMuted,
  }));
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");

  const toggleMicMuted = useMutation({
    mutationFn: () => listenerCommands.setMicMuted(!ongoingSessionMuted.micMuted),
  });

  const toggleSpeakerMuted = useMutation({
    mutationFn: () => listenerCommands.setSpeakerMuted(!ongoingSessionMuted.speakerMuted),
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

  const handleStopWithTemplate = () => {
    const actualTemplateId = selectedTemplate === "auto" ? null : selectedTemplate;
    onStop(actualTemplateId);
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
                  checked={!ongoingSessionMuted.micMuted}
                  onCheckedChange={(checked) => toggleMicMuted.mutate()}
                  disabled={sessionId === onboardingSessionId}
                />
                <span className="text-sm text-muted-foreground">
                  <Trans>{!ongoingSessionMuted.micMuted ? "Transcribe" : "Don't transcribe"}</Trans>
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
                  checked={!ongoingSessionMuted.speakerMuted}
                  onCheckedChange={(checked) => toggleSpeakerMuted.mutate()}
                />
                <span className="text-sm text-muted-foreground">
                  <Trans>{!ongoingSessionMuted.speakerMuted ? "Transcribe" : "Don't transcribe"}</Trans>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            <Trans>Audio input</Trans>
          </label>
          <MicrophoneDropdown
            disabled={sessionId === onboardingSessionId}
          />
        </div>
      </div>

      {/* Template Section */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          <Trans>Summary template</Trans>
        </label>
        <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              <span className="truncate">
                {selectedTemplate === "auto" || !selectedTemplate
                  ? t`Auto`
                  : getTemplateDisplayName(
                    templatesQuery.data?.find(tmpl => tmpl.id === selectedTemplate)?.title,
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

      <Separator />

      {/* Stop with Template Section */}
      <div>
        <Button
          variant="destructive"
          onClick={handleStopWithTemplate}
          className="w-full"
        >
          <StopCircleIcon size={16} className="mr-2" />
          <Trans>Stop with selected template</Trans>
        </Button>
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
  const { allDevices, currentDevice, isAutoMode, isLoading, selectDevice } = useMicrophoneDevice();
  const AUTO_MICROPHONE_VALUE = "__system_default_auto__";

  const selectedValue = isAutoMode ? AUTO_MICROPHONE_VALUE : (currentDevice || "");
  const autoDeviceLabel = currentDevice
    ? `${t`System Default (Auto)`} - ${currentDevice}`
    : t`System Default (Auto)`;

  const handleSelectDevice = (device: string) => {
    selectDevice(device);
  };

  return (
    <Select
      value={selectedValue}
      onValueChange={handleSelectDevice}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder={t`Select microphone...`} />
      </SelectTrigger>
      <SelectContent className="max-h-48 overflow-y-auto">
        <SelectItem value={AUTO_MICROPHONE_VALUE}>
          {autoDeviceLabel}
        </SelectItem>
        {isLoading
          ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground/50 mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading devices...</p>
            </div>
          )
          : allDevices.length === 0
          ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No microphones found</p>
            </div>
          )
          : (
            allDevices.map((device) => (
              <SelectItem key={device} value={device}>
                <span className="truncate">{device}</span>
              </SelectItem>
            ))
          )}
      </SelectContent>
    </Select>
  );
}
