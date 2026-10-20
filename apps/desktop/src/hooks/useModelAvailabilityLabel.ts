import type { ModelAvailability } from "@/lib/model-availability";
import { useLingui } from "@lingui/react/macro";

/** Shared lifecycle copy; feature-specific model descriptions stay with model metadata. */
export function useModelAvailabilityLabel() {
  const { t } = useLingui();
  return (availability: ModelAvailability): string => {
    switch (availability.status) {
      case "checking":
        return t`Checking model availability…`;
      case "error":
        return t`Could not prepare the model. Try again.`;
      case "needs-download":
        return t`Not downloaded`;
      case "downloading":
        return t`Downloading…`;
      case "loading":
        return t`Loading model…`;
      case "needs-api-key":
        return t`API key required`;
      case "unavailable":
        return availability.reason === "recorded-fallback-required"
          ? t`Download a Whisper model to transcribe recordings.`
          : t`Model unavailable`;
      case "ready":
        return availability.reason === "native-fallback"
          ? t`Ready with Whisper fallback`
          : t`Ready`;
    }
  };
}
