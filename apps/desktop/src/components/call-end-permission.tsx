import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { commands } from "@typr/plugin-notification";
import { Button } from "@typr/ui/components/ui/button";

export function useCallEndStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["notification", "call-end-status"],
    queryFn: () => commands.getCallEndStatus(),
    enabled,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });
}

export function CallEndPermissionNotice() {
  const queryClient = useQueryClient();
  const permission = useMutation({
    mutationFn: () => commands.openCallDetectionSettings(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification", "call-end-status"] }),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" role="status">
        <Trans>Typr needs Accessibility access to detect when calls end. Without access, recordings continue until you stop them.</Trans>
      </p>
      <Button type="button" size="sm" variant="outline" disabled={permission.isPending}
        onClick={() => permission.mutate()}>
        <Trans>Open permission settings</Trans>
      </Button>
      {permission.isError && (
        <p className="text-sm text-destructive" role="alert">
          <Trans>Couldn’t open permission settings. Open System Settings and allow Typr to control your Mac.</Trans>
        </p>
      )}
    </div>
  );
}
