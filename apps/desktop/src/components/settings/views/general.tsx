import { zodResolver } from "@hookform/resolvers/zod";
import { LANGUAGES_ISO_639_1 } from "@huggingface/languages";
import { i18n } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Plus, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { showModelSelectToast } from "@/components/toast/model-select";
import { LANGUAGE_OPTIONS } from "@/components/transcript/constants/languageData";
import { VocabularyTags } from "@/components/vocabulary-tags";
import { commands } from "@/types";
import { restartForLanguageChange } from "@/utils/app-restart";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { commands as configCommands, type ConfigGeneral } from "@typr/plugin-config";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@typr/ui/components/ui/command";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@typr/ui/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@typr/ui/components/ui/select";
import { Switch } from "@typr/ui/components/ui/switch";

type ISO_639_1_CODE = keyof typeof LANGUAGES_ISO_639_1;
const SUPPORTED_LANGUAGES: ISO_639_1_CODE[] = [
  "ar",
  "az",
  "bg",
  "bs",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fi",
  "fr",
  "gl",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lv",
  "mk",
  "ms",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "ta",
  "th",
  "tl",
  "tr",
  "uk",
  "vi",
  "zh",
];

const schema = z.object({
  autostart: z.boolean().optional(),
  displayLanguage: z.enum(SUPPORTED_LANGUAGES as [string, ...string[]]),
  spokenLanguages: z.array(z.enum(SUPPORTED_LANGUAGES as [string, ...string[]])),
  jargons: z.array(z.string()),
  saveRecordings: z.boolean().optional(),
  summaryLanguage: z.enum(SUPPORTED_LANGUAGES as [string, ...string[]]),
});

type Schema = z.infer<typeof schema>;

export default function General() {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const config = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
  });

  // Get current STT model to show model-aware UI
  const { data: connectorModel } = useQuery({
    queryKey: ["stt-model-connector"],
    queryFn: () => connectorCommands.getSttModel(),
    refetchOnWindowFocus: false,
  });

  // Determine if using cloud (Real-time multilingual) model
  const selectedModelOption = LANGUAGE_OPTIONS.find(o =>
    o.key === connectorModel || ("modelKey" in o && o.modelKey === connectorModel)
  );
  const isCloudModel = selectedModelOption && "isCloud" in selectedModelOption && selectedModelOption.isCloud;

  const form = useForm<Schema>({
    resolver: zodResolver(schema),
    defaultValues: {
      autostart: false,
      displayLanguage: "en",
      spokenLanguages: [],
      jargons: [],
      saveRecordings: false,
      summaryLanguage: "en",
    },
  });

  useEffect(() => {
    if (config.data) {
      console.log("[CONFIG] Loading config data:", config.data);
      console.log("[CONFIG] Loaded jargons:", config.data.jargons);
      console.log("[CONFIG] Summary language:", config.data.summary_language);

      form.reset({
        autostart: config.data.autostart ?? false,
        displayLanguage: config.data.display_language ?? "en",
        spokenLanguages: config.data.spoken_languages ?? ["en"],
        jargons: config.data.jargons ?? [],
        saveRecordings: config.data.save_recordings ?? false,
        summaryLanguage: config.data.summary_language ?? "en",
      });
    }
  }, [config.data, form]);

  const mutation = useMutation({
    mutationFn: async (v: Schema) => {
      if (!config.data) {
        console.error("cannot mutate config because it is not loaded");
        return;
      }

      const nextGeneral: ConfigGeneral = {
        autostart: v.autostart ?? false,
        display_language: v.displayLanguage,
        spoken_languages: v.spokenLanguages,
        telemetry_consent: config.data.telemetry_consent ?? true,
        jargons: v.jargons,
        save_recordings: v.saveRecordings ?? false,
        selected_template_id: config.data.selected_template_id,
        summary_language: v.summaryLanguage,
        show_consent_notification: config.data.show_consent_notification ?? true,
        show_upcoming_in_sidebar: config.data.show_upcoming_in_sidebar ?? false,
      };

      console.log("💾 Saving config with summary_language:", nextGeneral.summary_language);

      // Save to new config store (instant write to file!)
      await configCommands.setGeneralConfig(nextGeneral);

      console.log("✅ Config saved successfully");
    },
    onSuccess: () => {
      // Invalidate all config-related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: console.error,
  });

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      mutation.mutate(form.getValues());

      if (name === "autostart") {
        commands.setAutostart(!!value.autostart);
      }

      if (name === "displayLanguage" && value.displayLanguage) {
        // Activate the selected language immediately for instant feedback
        i18n.activate(value.displayLanguage);

        void showModelSelectToast(value.displayLanguage, () => {
          openSettingsWindow("/app/settings?tab=ai&section=transcription");
        }).catch(console.error);

        // Then restart app for full translation reload (reuse OTA restart pattern)
        // This ensures proper loading of all translated strings, especially in compiled bundles
        setTimeout(() => {
          restartForLanguageChange(value.displayLanguage!);
        }, 1000); // Small delay to let user see the immediate language change
      }
    });

    return () => subscription.unsubscribe();
  }, [form, mutation]);

  return (
    <div>
      <Form {...form}>
        <form className="space-y-8">
          {/* Hidden for now - keeping backend functionality intact */}
          {false && (
            <FormField
              control={form.control}
              name="saveRecordings"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div>
                    <FormLabel>
                      <Trans>Save recordings</Trans>
                    </FormLabel>
                    <FormDescription>
                      <Trans>
                        Choose whether to save your recordings locally.
                      </Trans>
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      color="gray"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="displayLanguage"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>
                    <Trans>App language</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>Primary language for the interface</Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue>
                        {LANGUAGES_ISO_639_1[field.value as ISO_639_1_CODE]?.name || field.value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">
                        <Trans>English</Trans>
                      </SelectItem>
                      <SelectItem value="es">
                        <Trans>Español</Trans>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="spokenLanguages"
            render={({ field }) => (
              <FormItem>
                <div className="space-y-0.5">
                  <FormLabel>
                    <Trans>Transcription languages (optional)</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>Add languages to improve accuracy. Leave empty for automatic detection.</Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex flex-wrap gap-2 min-h-[38px] p-2 border rounded-md">
                        {field.value.length === 0
                          ? (
                            <span className="text-sm text-muted-foreground">
                              <Trans>Auto-detect</Trans>
                            </span>
                          )
                          : (
                            field.value.map((langCode) => (
                              <Badge
                                key={langCode}
                                variant="secondary"
                                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-muted"
                              >
                                {LANGUAGES_ISO_639_1[langCode as ISO_639_1_CODE]?.name || langCode}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-3 w-3 p-0 hover:bg-transparent ml-0.5"
                                  onClick={() => {
                                    const newLanguages = field.value.filter((lang) => lang !== langCode);
                                    field.onChange(newLanguages);
                                    mutation.mutate(form.getValues());
                                  }}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </Button>
                              </Badge>
                            ))
                          )}
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-[38px] w-[38px]"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" align="end">
                          <Command>
                            <CommandInput placeholder={t`Search languages...`} className="h-9" />
                            <CommandEmpty>
                              <Trans>No language found.</Trans>
                            </CommandEmpty>
                            <CommandGroup className="max-h-[200px] overflow-auto">
                              {SUPPORTED_LANGUAGES.filter(
                                (lang) => !field.value.includes(lang),
                              ).map((lang) => (
                                <CommandItem
                                  key={lang}
                                  onSelect={() => {
                                    if (!field.value.includes(lang)) {
                                      field.onChange([...field.value, lang]);
                                      mutation.mutate(form.getValues());
                                    }
                                  }}
                                >
                                  {LANGUAGES_ISO_639_1[lang].name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Simple explanation card */}
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="space-y-1.5">
                          <div className="leading-relaxed">
                            {field.value.length === 0
                              ? (
                                <Trans>
                                  Detects any language automatically. Specify languages for faster, more accurate
                                  transcription.
                                </Trans>
                              )
                              : field.value.length === 1
                              ? (
                                <Trans>
                                  Prefers <strong>{LANGUAGES_ISO_639_1[field.value[0] as ISO_639_1_CODE]?.name}</strong>
                                  {" "}
                                  but falls back to auto-detection if needed.
                                </Trans>
                              )
                              : (
                                <Trans>
                                  Detects among {field.value.length} specified languages, with automatic fallback.
                                </Trans>
                              )}
                          </div>
                          {isCloudModel && (
                            <div className="text-muted-foreground/70 text-xs mt-1">
                              <Trans>This setting only affects offline transcription models.</Trans>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="summaryLanguage"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel>
                    <Trans>Summary language</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>Language for AI-generated meeting summaries</Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue>
                        {LANGUAGES_ISO_639_1[field.value as ISO_639_1_CODE]?.name || "English"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[250px] overflow-auto">
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {LANGUAGES_ISO_639_1[lang].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="jargons"
            render={({ field }) => (
              <FormItem>
                <div className="space-y-0.5">
                  <FormLabel>
                    <Trans>Custom vocabulary</Trans>
                  </FormLabel>
                  <FormDescription>
                    <Trans>
                      Add specific terms or jargon that are used in your company. Used to improve the transcription
                      accuracy.
                    </Trans>
                  </FormDescription>
                </div>
                <FormControl>
                  <VocabularyTags
                    value={field.value}
                    onChange={(newTags) => {
                      field.onChange(newTags);
                      // Auto-save when tags change
                      mutation.mutate(form.getValues());
                    }}
                    placeholder={t({
                      message: "Type terms separated by commas (e.g., Project Phoenix, OKR cadence)",
                    })}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </div>
  );
}
