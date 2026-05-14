import { LANGUAGES_ISO_639_1 } from "@huggingface/languages";
import { i18n } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { Badge } from "@typr/ui/components/ui/badge";
import { Button } from "@typr/ui/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@typr/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { StepIndicator } from "./step-indicator";

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

interface LanguageSelectionViewProps {
  onContinue: (languages: string[]) => void;
  onBack: () => void;
}

export function LanguageSelectionView({ onContinue, onBack }: LanguageSelectionViewProps) {
  const { t } = useLingui();
  // Smart defaults: Include UI language + English (if different)
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(() => {
    const uiLang = i18n.locale || "en";
    // If Spanish UI, default to both English and Spanish
    // If English UI, just default to English
    // User can always add more languages
    if (uiLang === "es") {
      return ["en", "es"];
    }
    return ["en"];
  });
  const [open, setOpen] = useState(false);

  const handleAddLanguage = (langCode: string) => {
    if (!selectedLanguages.includes(langCode)) {
      setSelectedLanguages([...selectedLanguages, langCode]);
    }
    setOpen(false);
  };

  const handleRemoveLanguage = (langCode: string) => {
    // Don't allow removing English or if it would leave us with no languages
    if (langCode === "en" || selectedLanguages.length <= 1) {
      return;
    }
    setSelectedLanguages(selectedLanguages.filter(l => l !== langCode));
  };

  const handleContinue = () => {
    onContinue(selectedLanguages);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      <StepIndicator currentStep={2} totalSteps={3} />

      <h2 className="text-2xl font-semibold mb-2 text-center">
        <Trans>What languages are your meetings in?</Trans>
      </h2>

      <p className="text-sm text-center text-muted-foreground mb-8">
        <Trans>
          Select languages used in your meetings. The model will automatically detect which one is being spoken.
        </Trans>
      </p>

      <div className="w-full space-y-3 mb-8">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-wrap gap-2 min-h-[38px] p-2 border rounded-md bg-background">
            {selectedLanguages.map((langCode) => (
              <Badge
                key={langCode}
                variant="secondary"
                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-muted"
              >
                {LANGUAGES_ISO_639_1[langCode as ISO_639_1_CODE]?.name || langCode}
                {selectedLanguages.length > 1 && langCode !== "en" && (
                  <button
                    type="button"
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveLanguage(langCode);
                    }}
                  >
                    <i className="ri-close-line text-xs" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-[38px] w-[38px]"
              >
                <i className="ri-add-line text-base" />
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
                    (lang) => !selectedLanguages.includes(lang),
                  ).map((lang) => {
                    const language = LANGUAGES_ISO_639_1[lang];
                    return (
                      <CommandItem
                        key={lang}
                        onSelect={() => handleAddLanguage(lang)}
                      >
                        {language.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          <Trans>You can always change this later in Settings</Trans>
        </p>
      </div>

      <div className="flex justify-between items-center w-full gap-4">
        <Button
          onClick={onBack}
          variant="ghost"
          size="lg"
          className="px-4"
        >
          <i className="ri-arrow-left-line text-base mr-2" />
          <Trans>Back</Trans>
        </Button>
        <Button
          onClick={handleContinue}
          disabled={selectedLanguages.length === 0}
          className="px-8"
          size="lg"
        >
          <Trans>Continue</Trans>
        </Button>
      </div>
    </div>
  );
}
