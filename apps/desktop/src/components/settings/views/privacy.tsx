import { zodResolver } from "@hookform/resolvers/zod";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataPathBlock } from "@/components/settings/components/data-path-block";
import { setUsageAnalyticsEnabled } from "@/utils/telemetry";
import { commands as analyticsCommands } from "@typr/plugin-analytics";
import { commands as configCommands } from "@typr/plugin-config";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@typr/ui/components/ui/form";
import { Switch } from "@typr/ui/components/ui/switch";

const schema = z.object({
  telemetryConsent: z.boolean().optional(),
  showConsentNotification: z.boolean().optional(),
});

type Schema = z.infer<typeof schema>;

export default function Privacy() {
  const queryClient = useQueryClient();

  const config = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
  });

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: {
      telemetryConsent: true,
      showConsentNotification: true,
    },
  });

  useEffect(() => {
    if (config.data) {
      form.reset({
        telemetryConsent: config.data.telemetry_consent ?? true,
        showConsentNotification: config.data.show_consent_notification ?? true,
      });
    }
  }, [config.data, form]);

  const mutation = useMutation({
    mutationFn: async (v: Schema) => {
      if (!config.data) {
        console.error("cannot mutate config because it is not loaded");
        return;
      }

      const nextGeneral = {
        ...config.data,
        telemetry_consent: v.telemetryConsent ?? true,
        show_consent_notification: v.showConsentNotification ?? true,
      };

      await configCommands.setGeneralConfig(nextGeneral);
      setUsageAnalyticsEnabled(nextGeneral.telemetry_consent);
      await analyticsCommands.setDisabled(!nextGeneral.telemetry_consent);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: console.error,
  });

  useEffect(() => {
    const subscription = form.watch(() => {
      mutation.mutate(form.getValues());
    });

    return () => subscription.unsubscribe();
  }, [form, mutation]);

  return (
    <div>
      <div className="space-y-2 mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          <Trans>Privacy</Trans>
        </h2>
        <p className="text-sm text-muted-foreground">
          <Trans>Control how your data is used and stored</Trans>
        </p>
      </div>

      <Form {...form}>
        <form className="space-y-8">
          {/* Usage Analytics */}
          <FormField
            control={form.control}
            name="telemetryConsent"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <FormLabel>
                    <Trans>Usage analytics</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>
                      Share feature usage to help improve the product. No personal information, conversations, or audio
                      collected
                    </Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Consent Notification */}
          <FormField
            control={form.control}
            name="showConsentNotification"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <FormLabel>
                    <Trans>Show transcription consent reminder</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>
                      Display a notification to remind you to inform participants when transcription starts
                    </Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* AI Training Opt-out */}
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium leading-none">
                <Trans>AI training opt-out</Trans>
              </div>
              <p className="text-sm text-muted-foreground">
                <Trans>Always enabled. Your chats and transcripts are never used to train AI models</Trans>
              </p>
            </div>
            <Switch
              checked={true}
              disabled={true}
              className="opacity-75"
            />
          </div>

          {/* Local Data & AI Access */}
          <div className="flex flex-row items-start justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium leading-none">
                <Trans>Your data</Trans>
              </div>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Everything stays on your device. Use this path with apps like Claude, Cursor, VS Code, or Codex to
                  read your notes directly.
                </Trans>
              </p>
              <DataPathBlock />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
