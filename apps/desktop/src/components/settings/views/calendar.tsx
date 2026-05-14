import { usePlatform } from "@/hooks/usePlatform";
import { type CalendarIntegration } from "@/types";
import { Badge } from "@typr/ui/components/ui/badge";
import { Trans } from "@lingui/react/macro";
import { AppleCalendarIntegrationDetails, CalendarIconWithText } from "../components/calendar";

const supportedIntegrations: CalendarIntegration[] = [
  "apple-calendar",
  // "google-calendar",
  // "outlook-calendar",
];

export default function Calendar() {
  const { isWindows, isLoading } = usePlatform();

  if (isLoading) {
    return null;
  }

  // Show coming soon message for Windows
  if (isWindows) {
    return (
      <div className="-mt-3">
        <div className="flex flex-col rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img
                src="/icons/outlook.svg"
                alt="Outlook Calendar"
                className="size-6"
              />
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Trans>Outlook Calendar</Trans>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0.5 font-medium"
                  >
                    <Trans>Coming soon</Trans>
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <Trans>Windows Outlook calendar integration</Trans>
                </div>
              </div>
            </div>
          </div>

          {/* Linear-inspired info card */}
          <div className="rounded-md bg-muted/30 p-4 border border-border/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  strokeWidth="2"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground font-medium mb-1">
                  <Trans>Coming to Windows</Trans>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <Trans>
                    We're working on bringing Outlook calendar integration to Windows. This feature will let you sync
                    your events and meetings automatically.
                  </Trans>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show Apple Calendar integration for macOS
  return (
    <div className="-mt-3">
      <ul className="flex flex-col">
        {supportedIntegrations.map((type) => (
          <li key={type}>
            <Integration type={type} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Integration({ type }: { type: CalendarIntegration }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 py-2">
        <CalendarIconWithText type={type} />
      </div>
      <div className="px-2">
        <AppleCalendarIntegrationDetails />
      </div>
    </div>
  );
}
