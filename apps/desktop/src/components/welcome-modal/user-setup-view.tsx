import { Trans, useLingui } from "@lingui/react/macro";
import { locale } from "@tauri-apps/plugin-os";
import { useEffect, useId, useState } from "react";

import { Button } from "@typr/ui/components/ui/button";
import { Input } from "@typr/ui/components/ui/input";
import { Label } from "@typr/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@typr/ui/components/ui/radio-group";
import { OnboardingLayout } from "./onboarding-layout";
import { StepIndicator } from "./step-indicator";

interface UserSetupViewProps {
  onContinue: (userData: { fullName: string; displayLanguage: string }) => void;
  existingData?: { fullName?: string; displayLanguage?: string };
}

export function UserSetupView({ onContinue, existingData }: UserSetupViewProps) {
  const { t } = useLingui();
  const fullNameId = useId();
  const englishId = useId();
  const spanishId = useId();
  const [fullName, setFullName] = useState("");
  const [displayLanguage, setDisplayLanguage] = useState("en");

  // Load existing data if provided (after app restart)
  useEffect(() => {
    if (existingData?.fullName) {
      setFullName(existingData.fullName);
      console.log("[Onboarding] Pre-populated name:", existingData.fullName);
    }
    if (existingData?.displayLanguage) {
      setDisplayLanguage(existingData.displayLanguage);
      console.log("[Onboarding] Pre-populated language:", existingData.displayLanguage);
    }
  }, [existingData]);

  // Auto-detect system language using Tauri's locale API (only if no existing data)
  useEffect(() => {
    // Skip auto-detection if we already have existing language data
    if (existingData?.displayLanguage) {
      return;
    }

    const detectSystemLanguage = async () => {
      try {
        const systemLocale = await locale();
        if (systemLocale) {
          // Extract language code from BCP-47 format (e.g., "es-ES" -> "es")
          const languageCode = systemLocale.split("-")[0];
          if (languageCode === "es" || languageCode === "en") {
            setDisplayLanguage(languageCode);
          } else {
            setDisplayLanguage("en"); // Default to English for unsupported languages
          }
        } else {
          // Fallback to browser detection if Tauri API fails
          const browserLang = navigator.language.startsWith("es") ? "es" : "en";
          setDisplayLanguage(browserLang);
        }
      } catch (error) {
        console.error("Failed to detect system language:", error);
        // Fallback to browser detection
        const browserLang = navigator.language.startsWith("es") ? "es" : "en";
        setDisplayLanguage(browserLang);
      }
    };

    detectSystemLanguage();
  }, [existingData?.displayLanguage]);

  const handleContinue = () => {
    if (fullName.trim()) {
      onContinue({
        fullName: fullName.trim(),
        displayLanguage,
      });
    }
  };

  const isValidName = fullName.trim().length >= 2;

  return (
    <OnboardingLayout
      title={<Trans>Welcome to Typr</Trans>}
      description={<Trans>Set up your profile to personalize your experience.</Trans>}
      stepIndicator={<StepIndicator currentStep={1} totalSteps={2} />}
      bodyClassName="space-y-6"
      footer={
        <Button
          onClick={handleContinue}
          disabled={!isValidName}
          className="w-full h-10"
          size="default"
        >
          <Trans>Continue</Trans>
        </Button>
      }
    >
      <div className="space-y-2">
        <Label htmlFor={fullNameId} className="text-sm font-medium">
          <Trans>Your full name</Trans>
        </Label>
        <Input
          id={fullNameId}
          placeholder={t`Your name`}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full"
          autoFocus
        />
      </div>

      {/* App Language Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          <Trans>App language</Trans>
        </Label>
        <RadioGroup
          value={displayLanguage}
          onValueChange={setDisplayLanguage}
          className="space-y-2"
        >
          <div className="flex items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
            <RadioGroupItem value="en" id={englishId} />
            <div>
              <Label htmlFor={englishId} className="font-normal cursor-pointer">
                <Trans>English</Trans>
              </Label>
            </div>
          </div>
          <div className="flex items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
            <RadioGroupItem value="es" id={spanishId} />
            <div>
              <Label htmlFor={spanishId} className="font-normal cursor-pointer">
                <Trans>Español</Trans>
              </Label>
            </div>
          </div>
        </RadioGroup>
      </div>
    </OnboardingLayout>
  );
}
