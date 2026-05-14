import { Button } from "@typr/ui/components/ui/button";
import { Trans } from "@lingui/react/macro";
import { OnboardingLayout } from "./onboarding-layout";

interface WelcomeViewProps {
  onContinue: () => void;
}

export function WelcomeView({ onContinue }: WelcomeViewProps) {
  return (
    <OnboardingLayout
      title={<Trans>Welcome to Typr</Trans>}
      description={
        <Trans>
          Typr turns your meetings into organized, searchable notes. Focus on the conversation, we'll handle the rest.
        </Trans>
      }
      footer={
        <Button onClick={onContinue} className="w-full h-10" size="default">
          <Trans>Continue</Trans>
        </Button>
      }
      footerNote={<Trans>Your audio is processed locally and notes stay private on your device.</Trans>}
    />
  );
}
