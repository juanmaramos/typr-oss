import { useLingui } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { SquareIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type GoogleMeetWaveformColor,
  GoogleMeetWaveformView,
  normalizeGoogleMeetWaveformAmplitude,
} from "@/components/ui/google-meet-waveform";
import { safeUnlisten } from "@/utils/safe-unlisten";
import { commands as listenerCommands, events as listenerEvents, type PipelineStatus } from "@typr/plugin-listener";

export const Route = createFileRoute("/transcription-status")({
  component: Component,
});

const AUDIO_RECENT_MS = 2500;
const WORDS_RECENT_MS = 12000;

function Component() {
  const { t } = useLingui();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [amplitude, setAmplitude] = useState(0);
  const [stopping, setStopping] = useState(false);
  const now = useTicker(!!status && status.phase !== "inactive");
  const view = useMemo(() => getStatusView(status, now, t), [status, now, t]);

  useTransparentWindowBackground();

  useEffect(() => {
    let disposed = false;
    let unlistenStatus: (() => void) | undefined;
    let unlistenSession: (() => void) | undefined;

    listenerCommands.getPipelineStatus()
      .then((nextStatus) => {
        if (!disposed) {
          setStatus(nextStatus);
        }
      })
      .catch((error) => {
        console.error("[transcription-status] Failed to load pipeline status", error);
      });

    listenerEvents.pipelineStatusChanged.listen(({ payload }) => {
      setStatus(payload.status);
      if (payload.status.phase === "inactive") {
        setStopping(false);
        setAmplitude(0);
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "transcription-status.pipeline-status.late-dispose");
        return;
      }
      unlistenStatus = fn;
    }).catch((error) => {
      console.error("[transcription-status] Failed to listen for pipeline status", error);
    });

    listenerEvents.sessionEvent.listen(({ payload }) => {
      const timestamp = new Date().toISOString();

      if (payload.type === "audioAmplitude") {
        setAmplitude(normalizeGoogleMeetWaveformAmplitude(payload.mic, payload.speaker));
        if (payload.mic > 0 || payload.speaker > 0) {
          setStatus((current) => current ? { ...current, last_audio_at: timestamp } : current);
        }
        return;
      }

      if ((payload.type === "words" || payload.type === "preview") && payload.words.length > 0) {
        setStatus((current) => current ? { ...current, last_words_at: timestamp } : current);
      }
    }).then((fn) => {
      if (disposed) {
        safeUnlisten(fn, "transcription-status.session-event.late-dispose");
        return;
      }
      unlistenSession = fn;
    }).catch((error) => {
      console.error("[transcription-status] Failed to listen for session events", error);
    });

    return () => {
      disposed = true;
      safeUnlisten(unlistenStatus, "transcription-status.pipeline-status");
      safeUnlisten(unlistenSession, "transcription-status.session-event");
    };
  }, []);

  const stopTranscription = useCallback(async () => {
    if (stopping) {
      return;
    }

    setStopping(true);
    try {
      await listenerCommands.stopSession();
    } catch (error) {
      console.error("[transcription-status] Failed to stop session", error);
      setStopping(false);
    }
  }, [stopping]);

  if (!status || status.phase === "inactive") {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  return (
    <main
      aria-label={`Transcription status: ${view.label}`}
      aria-live="polite"
      className="h-screen w-screen select-none bg-transparent"
    >
      <div className="grid h-full w-full grid-cols-[calc(100vh+8px)_1fr_calc(100vh+8px)] items-center overflow-hidden rounded-b-[10px] rounded-t-none bg-black text-white">
        <span className="sr-only">{view.label}</span>
        <div className="flex h-full items-center justify-center">
          <GoogleMeetWaveformView
            amplitude={view.useAmplitude ? amplitude : 0}
            color={view.waveformColor}
            size="compact"
          />
        </div>

        <div />

        <button
          type="button"
          aria-label={stopping ? "Stopping transcription" : "Stop transcription"}
          title={stopping ? "Stopping transcription" : "Stop transcription"}
          disabled={stopping}
          onClick={stopTranscription}
          className="flex size-[18px] items-center justify-center justify-self-center rounded-full border border-destructive/50 bg-destructive/85 text-destructive-foreground shadow-sm shadow-destructive/20 transition-[background-color,box-shadow,transform] hover:bg-destructive hover:shadow-md hover:shadow-destructive/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/45 disabled:cursor-default disabled:opacity-55"
        >
          <SquareIcon className="size-[9px]" fill="currentColor" strokeWidth={2.5} />
        </button>
      </div>
    </main>
  );
}

function useTransparentWindowBackground() {
  useEffect(() => {
    const htmlBackground = document.documentElement.style.background;
    const bodyBackground = document.body.style.background;
    const bodyOverflow = document.body.style.overflow;

    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.background = htmlBackground;
      document.body.style.background = bodyBackground;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);
}

function useTicker(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return now;
}

type StatusView = {
  label: string;
  waveformColor: GoogleMeetWaveformColor;
  useAmplitude: boolean;
};

function getStatusView(status: PipelineStatus | null, now: number, t: ReturnType<typeof useLingui>["t"]) {
  if (!status) {
    return { label: t`Listening`, waveformColor: "blue-dark", useAmplitude: false } satisfies StatusView;
  }

  if (status.phase === "starting") {
    return { label: t`Starting`, waveformColor: "warning", useAmplitude: false } satisfies StatusView;
  }

  if (status.phase === "reconnecting") {
    const attempt = status.reconnect_attempt && status.reconnect_max_attempts
      ? ` ${status.reconnect_attempt}/${status.reconnect_max_attempts}`
      : "";
    return { label: t`Reconnecting${attempt}`, waveformColor: "warning", useAmplitude: false } satisfies StatusView;
  }

  if (status.phase === "paused") {
    return { label: t`Paused`, waveformColor: "primary", useAmplitude: false } satisfies StatusView;
  }

  if (status.phase === "failed") {
    return { label: t`Needs attention`, waveformColor: "destructive", useAmplitude: false } satisfies StatusView;
  }

  if (!status.mic_enabled && !status.speaker_enabled) {
    return { label: t`No audio input`, waveformColor: "warning", useAmplitude: false } satisfies StatusView;
  }

  const heardAudio = isRecent(status.last_audio_at, now, AUDIO_RECENT_MS);
  const receivedWords = isRecent(status.last_words_at, now, WORDS_RECENT_MS);

  if (heardAudio || receivedWords) {
    return { label: t`Transcribing`, waveformColor: "blue-dark", useAmplitude: true } satisfies StatusView;
  }

  return { label: t`Listening`, waveformColor: "blue-dark", useAmplitude: false } satisfies StatusView;
}

function isRecent(value: string | null, now: number, windowMs: number) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) && now - time <= windowMs;
}
