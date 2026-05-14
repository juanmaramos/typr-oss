import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";

import { commands as listenerCommands } from "@typr/plugin-listener";
import { Button } from "@typr/ui/components/ui/button";
import { Spinner } from "@typr/ui/components/ui/spinner";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useState } from "react";
import { OnboardingLayout } from "./onboarding-layout";
import { StepIndicator } from "./step-indicator";

interface AudioPermissionsViewProps {
  onContinue: () => void;
}

export function AudioPermissionsView({ onContinue }: AudioPermissionsViewProps) {
  const { t } = useLingui();
  const [micPermissionRequested, setMicPermissionRequested] = useState(false);
  const [hasAutoContinued, setHasAutoContinued] = useState(false);

  const micPermissionStatus = useQuery({
    queryKey: ["micPermission"],
    queryFn: () => listenerCommands.checkMicrophoneAccess(),
    refetchInterval: micPermissionRequested ? 1000 : false, // Only poll after permission requested
    refetchIntervalInBackground: false, // Don't poll in background
  });

  const systemAudioPermissionStatus = useQuery({
    queryKey: ["systemAudioPermission"],
    queryFn: () => listenerCommands.checkSystemAudioAccess(),
    refetchInterval: false, // System permissions don't change without user action
    refetchIntervalInBackground: false,
  });

  const micPermission = useMutation({
    mutationFn: () => listenerCommands.requestMicrophoneAccess(),
    onSuccess: () => {
      setMicPermissionRequested(true);
      setTimeout(() => {
        micPermissionStatus.refetch();
      }, 3000);
    },
    onError: (error) => {
      setMicPermissionRequested(true);
      console.error(error);
    },
  });

  const capturePermission = useMutation({
    mutationFn: () => listenerCommands.requestSystemAudioAccess(),
    onSuccess: () => {
      // DON'T call onContinue() here - it would start downloads before restart!
      // The app needs to restart for system audio permissions to take effect.
      // After restart, onboarding will still be active and user can continue.

      message(t`The app will now restart to apply the changes`, {
        kind: "info",
        title: t`System audio status changed`,
      });
      setTimeout(() => {
        relaunch();
      }, 2000);
    },
    onError: console.error,
  });

  const handleMicPermissionAction = () => {
    if (micPermissionRequested && !micPermissionStatus.data) {
      listenerCommands.openMicrophoneAccessSettings();
    } else {
      micPermission.mutate();
    }
  };

  const allPermissionsGranted = micPermissionStatus.data && systemAudioPermissionStatus.data;

  // Auto-continue after restart if permissions are already granted
  useEffect(() => {
    if (allPermissionsGranted && !micPermissionRequested && !hasAutoContinued) {
      // All permissions granted (likely after restart) - automatically continue once
      // Small delay to prevent UI flash on restart
      setHasAutoContinued(true);
      const timer = setTimeout(() => {
        onContinue();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [allPermissionsGranted, micPermissionRequested, hasAutoContinued, onContinue]);

  return (
    <OnboardingLayout
      title={<Trans>Audio permissions</Trans>}
      description={
        <Trans>
          Typr transcribes audio directly from your device. Grant microphone and system audio access to get started.
        </Trans>
      }
      stepIndicator={<StepIndicator currentStep={2} totalSteps={2} />}
      bodyClassName="space-y-3"
      footer={
        <Button
          onClick={onContinue}
          disabled={!allPermissionsGranted}
          className="w-full h-10"
          size="default"
        >
          <Trans>Continue</Trans>
        </Button>
      }
      footerNote={!allPermissionsGranted && <Trans>Grant both permissions to continue.</Trans>}
    >
      <div className="flex items-center justify-between rounded-lg border bg-background p-4 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <i className="ri-mic-fill text-muted-foreground text-base flex-shrink-0" />
          <div className="text-sm font-medium text-foreground">
            <Trans>Transcribe my voice</Trans>
          </div>
        </div>
        <Button
          variant={micPermissionStatus.data ? "secondary" : "default"}
          size="sm"
          onClick={handleMicPermissionAction}
          disabled={micPermission.isPending || micPermissionStatus.data}
          className="h-8 px-3 text-xs"
        >
          {micPermission.isPending
            ? (
              <>
                <Spinner className="mr-1 h-3 w-3" />
                <Trans>Enabling...</Trans>
              </>
            )
            : micPermissionStatus.data
            ? <Trans>Enabled</Trans>
            : micPermissionRequested
            ? <Trans>Open Settings</Trans>
            : <Trans>Enable Microphone</Trans>}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-background p-4 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <i className="ri-speak-fill text-muted-foreground text-base flex-shrink-0" />
          <div className="text-sm font-medium text-foreground">
            <Trans>Transcribe other people's voices</Trans>
          </div>
        </div>
        <Button
          variant={systemAudioPermissionStatus.data ? "secondary" : "default"}
          size="sm"
          onClick={() => capturePermission.mutate({})}
          disabled={capturePermission.isPending || systemAudioPermissionStatus.data}
          className="h-8 px-3 text-xs"
        >
          {capturePermission.isPending
            ? (
              <>
                <Spinner className="mr-1 h-3 w-3" />
                <Trans>Enabling...</Trans>
              </>
            )
            : systemAudioPermissionStatus.data
            ? <Trans>Enabled</Trans>
            : <Trans>Enable System Audio</Trans>}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
