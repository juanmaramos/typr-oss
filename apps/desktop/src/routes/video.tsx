import type MuxPlayerElement from "@mux/mux-player";
import type { MuxPlayerElementEventMap } from "@mux/mux-player";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { useTypr } from "@/contexts";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { events as listenerEvents } from "@typr/plugin-listener";
import { commands as windowsCommands, events as windowsEvents } from "@typr/plugin-windows";

const schema = z.object({
  id: z.string(),
});

export const Route = createFileRoute("/video")({
  component: Component,
  validateSearch: zodValidator(schema),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps: { id } }) => {
    return { id };
  },
});

function Component() {
  const { id } = Route.useLoaderData();

  const player = useRef<MuxPlayerElement>(null);
  const { userId } = useTypr();

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void;

    listenerEvents.sessionEvent.listen(({ payload }) => {
      if (payload.type === "running_paused") {
        player.current?.pause();
      }

      if (payload.type === "running_active") {
        player.current?.play();

        safeAnalyticsEvent({
          event: "onboarding_video_started",
          distinct_id: userId,
        });
      }

      if (payload.type === "inactive") {
        handleEnded();
      }
    }).then((u) => {
      if (disposed) {
        safeUnlisten(u, "video.sessionEvent.listener.late-dispose");
        return;
      }

      unlisten = u;
    }).catch((error) => {
      console.error("[events] Failed to register session listener in video route", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlisten, "video.sessionEvent.listener");
    };
  }, []);

  const styles = {
    "--bottom-controls": "none",
    "aspectRatio": "16 / 9",
  } as React.CSSProperties;

  const handleEnded = () => {
    windowsCommands.windowDestroy({ type: "video", value: id });
  };

  const [didExpandRightPanel, setDidExpandRightPanel] = useState(false);

  const handleTimeUpdate = (e: MuxPlayerElementEventMap["timeupdate"]) => {
    if (e.timeStamp > 67500 && !didExpandRightPanel) {
      setDidExpandRightPanel(true);
      windowsEvents.mainWindowState.emit({
        left_sidebar_expanded: null,
        right_panel_expanded: true,
      });
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full h-full relative"
    >
      <div className="absolute top-0 left-0 w-full h-11 bg-transparent z-50" data-tauri-drag-region></div>
      <MuxPlayer
        ref={player}
        playbackId={id}
        autoPlay={true}
        style={styles}
        loading="viewport"
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        disableTracking={import.meta.env.DEV}
      />
    </div>
  );
}
