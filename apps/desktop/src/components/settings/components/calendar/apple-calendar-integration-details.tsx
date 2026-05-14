import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type as getOsType } from "@tauri-apps/plugin-os";
import { useCallback } from "react";

import { isContactsAccessUIEnabled } from "@/lib/features";
import { commands as appleCalendarCommands } from "@typr/plugin-apple-calendar";
import { commands as configCommands, type ConfigGeneral } from "@typr/plugin-config";
import { Button } from "@typr/ui/components/ui/button";
import { Switch } from "@typr/ui/components/ui/switch";
import { cn } from "@typr/ui/lib/utils";
import { CalendarSelector } from "./calendar-selector";

export function AppleCalendarIntegrationDetails() {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const calendarAccess = useQuery({
    queryKey: ["settings", "calendarAccess"],
    queryFn: () => appleCalendarCommands.calendarAccessStatus(),
    refetchInterval: false, // Access status doesn't change without user action
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const contactsAccess = useQuery({
    queryKey: ["settings", "contactsAccess"],
    queryFn: () => appleCalendarCommands.contactsAccessStatus(),
    refetchInterval: false, // Access status doesn't change without user action
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000, // Cache for 30 seconds
    enabled: isContactsAccessUIEnabled(),
  });

  const generalConfigQuery = useQuery({
    queryKey: ["config", "general"],
    queryFn: () => configCommands.getGeneralConfig(),
  });

  const updateSidebarVisibility = useMutation({
    mutationFn: async (showUpcoming: boolean) => {
      if (!generalConfigQuery.data) {
        return;
      }

      const nextGeneral: ConfigGeneral = {
        ...generalConfigQuery.data,
        show_upcoming_in_sidebar: showUpcoming,
      };

      await configCommands.setGeneralConfig(nextGeneral);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "general"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => {
      console.error("Failed to update sidebar calendar visibility:", error);
    },
  });

  const handleRequestCalendarAccess = useCallback(() => {
    if (getOsType() === "macos") {
      appleCalendarCommands
        .requestCalendarAccess()
        .then(() => {
          calendarAccess.refetch();
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }, []);

  const handleRequestContactsAccess = useCallback(() => {
    if (getOsType() === "macos") {
      appleCalendarCommands
        .requestContactsAccess()
        .then(() => {
          contactsAccess.refetch();
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-col rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/icons/calendar.png"
              alt={t`Apple Calendar`}
              className="size-6"
            />
            <div>
              <div className="text-sm font-medium">
                <Trans>Calendar access</Trans>
              </div>
              <div className="text-xs text-muted-foreground">
                {calendarAccess.data
                  ? <Trans>Access granted</Trans>
                  : <Trans>Connect your calendar to sync events</Trans>}
              </div>
            </div>
          </div>
          {!calendarAccess.data && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestCalendarAccess}
              className="min-w-12 text-center"
            >
              <Trans>Grant Access</Trans>
            </Button>
          )}
        </div>

        {calendarAccess.data && (
          <div className="mt-4 pt-4">
            <CalendarSelector />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <img
            src="/icons/calendar.png"
            alt={t`Sidebar Calendar`}
            className="size-6"
          />
          <div>
            <div className="text-sm font-medium">
              <Trans>Show upcoming events in sidebar</Trans>
            </div>
            <div className="text-xs text-muted-foreground">
              <Trans>Show notes from upcoming calendar events above your notes list.</Trans>
            </div>
          </div>
        </div>
        <Switch
          checked={generalConfigQuery.data?.show_upcoming_in_sidebar ?? true}
          disabled={generalConfigQuery.isLoading || updateSidebarVisibility.isPending}
          onCheckedChange={(checked) => updateSidebarVisibility.mutate(checked)}
        />
      </div>

      {isContactsAccessUIEnabled() && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border p-4",
            !contactsAccess.data && "bg-muted",
          )}
        >
          <div className="flex items-center gap-3">
            <img
              src="/icons/contacts.png"
              alt={t`Apple Contacts`}
              className="size-6"
            />
            <div>
              <div className="text-sm font-medium">
                <Trans>Contacts Access</Trans>
              </div>
              <div className="text-xs text-muted-foreground">
                {contactsAccess.data
                  ? <Trans>Access granted</Trans>
                  : <Trans>Optional for participant suggestions</Trans>}
              </div>
            </div>
          </div>
          {!contactsAccess.data && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestContactsAccess}
              className="min-w-12 text-center"
            >
              <Trans>Grant Access</Trans>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
