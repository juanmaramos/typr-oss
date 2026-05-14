import { zodResolver } from "@hookform/resolvers/zod";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { commands as notificationCommands } from "@typr/plugin-notification";
import { Badge } from "@typr/ui/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@typr/ui/components/ui/form";
import { Switch } from "@typr/ui/components/ui/switch";

const schema = z.object({
  detect: z.boolean().optional(),
  event: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export default function NotificationsComponent() {
  const eventNotification = useQuery({
    queryKey: ["notification", "event"],
    queryFn: () => notificationCommands.getEventNotification(),
  });

  const detectNotification = useQuery({
    queryKey: ["notification", "detect"],
    queryFn: () => notificationCommands.getDetectNotification(),
  });

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    values: {
      detect: detectNotification.data ?? false,
      event: eventNotification.data ?? false,
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
                      <Trans>
                        Automatically starts, pauses, and stops transcription when meetings are detected.
                      </Trans>
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
          {/* Calendar notifications temporarily hidden - app detection is primary method */}
        </form>
      </Form>
    </div>
  );
}
