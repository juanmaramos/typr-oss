import { zodResolver } from "@hookform/resolvers/zod";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { commands as notificationCommands } from "@typr/plugin-notification";
import { Badge } from "@typr/ui/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@typr/ui/components/ui/form";
import { Switch } from "@typr/ui/components/ui/switch";

import { CallEndPermissionNotice, useCallEndStatus } from "../../call-end-permission";

const schema = z.object({
  detect: z.boolean().optional(),
  event: z.boolean().optional(),
  callEnd: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export default function NotificationsComponent() {
  const queryClient = useQueryClient();
  const eventNotification = useQuery({
    queryKey: ["notification", "event"],
    queryFn: () => notificationCommands.getEventNotification(),
  });

  const detectNotification = useQuery({
    queryKey: ["notification", "detect"],
    queryFn: () => notificationCommands.getDetectNotification(),
  });

  const callEndEnabled = useQuery({
    queryKey: ["notification", "call-end"],
    queryFn: () => notificationCommands.getCallEndEnabled(),
  });
  const callEndStatus = useCallEndStatus(callEndEnabled.data === true);

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    values: {
      detect: detectNotification.data ?? false,
      event: eventNotification.data ?? false,
      callEnd: callEndEnabled.data ?? false,
    },
  });

  const eventMutation = useMutation({
    mutationFn: async (v: Schema) => {
      const enabled = v.event === true;

      if (enabled) {
        await notificationCommands.requestNotificationPermission();
        await notificationCommands.setEventNotification(true);
        await notificationCommands.startEventNotification();
      } else {
        await notificationCommands.stopEventNotification();
        await notificationCommands.setEventNotification(false);
      }
      return enabled;
    },
    onSuccess: () => {
      eventNotification.refetch();
    },
  });

  const detectMutation = useMutation({
    mutationFn: async (v: Schema) => {
      const enabled = v.detect === true;

      if (enabled) {
        await notificationCommands.requestNotificationPermission();
        await notificationCommands.setDetectNotification(true);
        await notificationCommands.startDetectNotification();
      } else {
        await notificationCommands.stopDetectNotification();
        await notificationCommands.setDetectNotification(false);
      }
      return enabled;
    },
    onSuccess: () => {
      detectNotification.refetch();
    },
  });

  const callEndMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) await notificationCommands.requestNotificationPermission();
      await notificationCommands.setCallEndEnabled(enabled);
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(["notification", "call-end"], enabled);
      void queryClient.invalidateQueries({ queryKey: ["notification", "call-end-status"] });
    },
    onError: () => { void callEndEnabled.refetch(); },
  });

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "detect") {
        detectMutation.mutate(value);
      }
      if (name === "event") {
        eventMutation.mutate(value);
      }
    });

    return () => subscription.unsubscribe();
  }, [eventMutation, detectMutation]);

  return (
    <div>
      <Form {...form}>
        <form className="space-y-6">
          <FormField
            control={form.control}
            name="detect"
            render={({ field }) => (
              <FormItem className="space-y-6">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <FormLabel className="flex items-center gap-2">
                      <Trans>Auto-detect meetings</Trans>
                      <Badge variant="secondary" className="text-xs">
                        <Trans>Beta</Trans>
                      </Badge>
                    </FormLabel>
                    <FormDescription>
                      <Trans>Shows a notification when a call is detected.</Trans>
                    </FormDescription>
                  </div>

                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="callEnd"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <FormLabel><Trans>Stop recording after a call</Trans></FormLabel>
                    <FormDescription>
                      <Trans>Link a recording to Zoom, Teams, or Google Meet. Recording stops two minutes after the call ends, unless you rejoin. If we’re unsure the call ended, we’ll ask before stopping.</Trans>
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={enabled => callEndMutation.mutate(enabled)}
                      disabled={callEndEnabled.isPending || callEndMutation.isPending} />
                  </FormControl>
                </div>
                {callEndEnabled.data === true && callEndStatus.data?.type === "permission_required"
                  && <CallEndPermissionNotice />}
                {callEndMutation.isError && <p className="text-sm text-destructive" role="alert"><Trans>Couldn’t change this setting. Try again.</Trans></p>}
              </FormItem>
            )}
          />
          {/* Calendar notifications temporarily hidden - app detection is primary method */}
        </form>
      </Form>
    </div>
  );
}
