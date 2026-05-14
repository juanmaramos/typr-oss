import { commands as listenerCommands, events } from "@typr/plugin-listener";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { deviceChangedDuringRecordingToast } from "@/components/toast/shared";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { useOngoingSession } from "@typr/utils/contexts";

export const AUTO_MICROPHONE_VALUE = "__system_default_auto__";

/**
 * Shared hook for microphone device management
 * Used by both the existing MicrophoneSelector and the new transcript MicrophoneSelector
 *
 * Automatically refreshes device list when system detects audio device changes
 */
export function useMicrophoneDevice() {
  const queryClient = useQueryClient();
  const sessionStatus = useOngoingSession((s) => s.status);
  // Ref so the event listener callback always sees the latest status
  const sessionStatusRef = useRef(sessionStatus);
  sessionStatusRef.current = sessionStatus;

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
  const isAutoModeRef = useRef(isAutoMode);
  isAutoModeRef.current = isAutoMode;

  // Listen for device change events from the backend
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    events.sessionEvent.listen(({ payload }) => {
      if (payload.type === "deviceChanged") {
        console.log("[useMicrophoneDevice] Device change detected, refreshing device list...");
        // Invalidate and refetch both queries when device changes are detected
        queryClient.invalidateQueries({ queryKey: ["microphone", "devices"] });
        queryClient.invalidateQueries({ queryKey: ["microphone", "current-device"] });
        queryClient.invalidateQueries({ queryKey: ["microphone", "selection-mode"] });

        // Notify user if a device changed during an active recording session
        const status = sessionStatusRef.current;
        if (status === "running_active" || status === "running_paused") {
          deviceChangedDuringRecordingToast(isAutoModeRef.current);
        }
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "useMicrophoneDevice.sessionEvent.listener.late-dispose");
        return;
      }

      unlisten = fn;
    }).catch((error) => {
      console.error("[events] Failed to register microphone device listener", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "useMicrophoneDevice.sessionEvent.listener");
    };
  }, [queryClient]);

  const handleSelectDevice = async (device: string) => {
    if (device === AUTO_MICROPHONE_VALUE) {
      await listenerCommands.setMicrophoneAuto();
    } else {
      await listenerCommands.setMicrophoneDevice(device);
    }
    currentDeviceQuery.refetch();
    selectionModeQuery.refetch();
  };

  return {
    allDevices: allDevicesQuery.data || [],
    currentDevice: currentDeviceQuery.data,
    isAutoMode,
    isLoading: allDevicesQuery.isLoading || currentDeviceQuery.isLoading || selectionModeQuery.isLoading,
    selectDevice: handleSelectDevice,
  };
}
