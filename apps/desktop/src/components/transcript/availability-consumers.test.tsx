// @vitest-environment jsdom
import { type ModelAvailability, modelAvailability } from "@/lib/model-availability";
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@typr/ui/components/ui/tooltip";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  live: {} as ModelAvailability,
  recorded: {} as ModelAvailability,
  selectedModel: "Nemotron3p5Streaming",
  modes: [] as string[],
  status: "inactive",
  sessionId: null as string | null,
  start: vi.fn(),
  retry: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  pickFile: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock("@/hooks/useTranscriptionAvailability", () => ({
  useTranscriptionAvailability: (mode = "live") => {
    state.modes.push(mode);
    return {
      selectedModel: state.selectedModel,
      availability: mode === "recorded" ? state.recorded : state.live,
      getAvailability: () => state.live,
      retry: state.retry,
    };
  },
}));
vi.mock("@/hooks/useModelState", () => ({
  useModelState: () => {
    throw new Error("Consumer must use the central transcription policy");
  },
}));
vi.mock("@/contexts", () => ({
  useTypr: () => ({ userId: "user", onboardingSessionId: "onboard", thankYouSessionId: "onboard" }),
  useRightPanel: () => ({ surface: "sidebar", showSidebar: vi.fn(), openFloating: vi.fn(), showFloatingDock: vi.fn() }),
}));
vi.mock("@/contexts/audio-upload", () => ({ useAudioUpload: () => ({ openAudioUpload: vi.fn() }) }));
vi.mock("@/contexts/settings-dialog", () => ({ useSettingsDialog: () => ({ openDialog: state.openSettings }) }));
vi.mock("@/stores/audio-upload", () => ({
  useAudioUploadStore: (selector: (state: object) => unknown) => selector({ progress: { status: "idle" } }),
}));
vi.mock("@typr/utils/contexts", () => ({
  useOngoingSession: (selector: (value: object) => unknown) =>
    selector({
      sessionId: state.sessionId,
      status: state.status,
      start: state.start,
      resume: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setAutoEnhanceTemplate: vi.fn(),
      loading: false,
      micMuted: false,
      speakerMuted: false,
    }),
  useSession: (_id: string, selector: (value: object) => unknown) =>
    selector({ session: { words: [], enhanced_memo_html: null } }),
}));
vi.mock("@/hooks/enhance-pending", () => ({ useEnhancePendingState: () => false }));
vi.mock("@/hooks/useRecordingTimer", () => ({
  useRecordingTimer: () => ({ remaining: 0, isWarning: false, isDanger: false, shouldShowTimer: false }),
}));
vi.mock("@/hooks/useUploadAudio", () => ({
  AUDIO_EXTENSIONS: ["wav"],
  useUploadAudio: () => ({ upload: state.upload, reset: vi.fn(), isProcessing: false }),
}));
vi.mock("@/utils/consent-notification", () => ({ useConsentNotification: () => vi.fn() }));
vi.mock("@/utils/template-service", () => ({ TemplateService: { getAllTemplates: vi.fn(async () => []) } }));
vi.mock("@/components/transcript/hooks/useMicrophoneDevice", () => ({ useMicrophoneDevice: () => ({}) }));
vi.mock("@/components/transcript/hooks/useSTTModel", () => ({
  useSTTModel: () => ({ selectedLanguage: "nemotron-streaming", handleLanguageChange: vi.fn(), isChanging: false }),
}));
vi.mock("@/components/right-panel/hooks/useTranscriptWidget", () => ({
  useTranscriptWidget: () => ({ showEmptyMessage: true, hasTranscript: false, isLive: false, words: [], previews: {} }),
}));
vi.mock("@/components/transcript/actions/STTLanguageSelector", () => ({
  STTLanguageSelector: ({ disabled, triggerVariant }: { disabled?: boolean; triggerVariant?: string }) => (
    <button disabled={disabled} data-trigger-variant={triggerVariant}>Select model</button>
  ),
}));
vi.mock("@/components/transcript/actions/TranscriptActionBar", () => ({ TranscriptActionBar: () => null }));
vi.mock("@/components/editor-area/note-header/player-controls", () => ({ PlayerControls: () => null }));
vi.mock("@/components/right-panel/components/search", () => ({ SearchHeader: () => null }));
vi.mock("@typr/tiptap/transcript", () => ({ default: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useMatch: () => ({ params: { id: "note" } }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@typr/plugin-db", () => ({
  commands: {
    getSession: vi.fn(async ({ id }: { id: string }) => ({ id, words: [] })),
    upsertSession: vi.fn(),
    sessionAddParticipant: vi.fn(),
  },
}));
vi.mock("@typr/plugin-config", () => ({ commands: { getGeneralConfig: vi.fn(async () => ({})) } }));
vi.mock("@typr/plugin-listener", () => ({
  commands: {
    setMicMuted: vi.fn(),
    listMicrophoneDevices: vi.fn(async () => []),
    getCurrentMicrophoneDevice: vi.fn(async () => null),
    getMicrophoneSelectionMode: vi.fn(async () => "auto"),
  },
}));
vi.mock(
  "@typr/plugin-local-stt",
  () => ({
    commands: {
      listModelCapabilities: vi.fn(
        async () => [{ model: "QuantizedLargeTurbo", available: true, live_fallback_models: [] }],
      ),
      isModelDownloaded: vi.fn(async () => false),
      isModelDownloading: vi.fn(async () => false),
      downloadModelBackground: state.download,
    },
  }),
);
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: state.pickFile }));
vi.mock("@tauri-apps/plugin-fs", () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ appDataDir: vi.fn(), join: vi.fn() }));
vi.mock("motion/react", () => ({
  motion: {
    div: (
      {
        children,
        initial: _initial,
        animate: _animate,
        variants: _variants,
        transition: _transition,
        whileHover: _whileHover,
        ...props
      }: Record<string, unknown>,
    ) => <div {...props}>{children as ReactNode}</div>,
    p: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  },
}));

import { AudioUploadDialog } from "../audio-upload-dialog";
import ListenButton from "../editor-area/note-header/listen-button";
import TranscriptionBar from "../editor-area/note-header/transcription-bar";
import { TranscriptView } from "../right-panel/views/transcript-view";
import { useModelDownload } from "./hooks/useModelDownload";
let downloadActions: ReturnType<typeof useModelDownload>;
function DownloadProbe() {
  downloadActions = useModelDownload();
  return null;
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
async function render(content: ReactNode) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <TooltipProvider>{content}</TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
}
function button(text: string) {
  return [...document.body.querySelectorAll("button")].find(button =>
    button.textContent?.trim() === text
  ) as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: (entries: Array<{ contentRect: { width: number } }>) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 400 } }]);
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 400,
    height: 300,
    x: 0,
    y: 0,
    top: 0,
    right: 400,
    bottom: 300,
    left: 0,
    toJSON: () => ({}),
  });
  notifyManager.setScheduler(callback => callback());
  i18n.load("en", english);
  i18n.activate("en");
  state.live = modelAvailability("ready");
  state.recorded = modelAvailability("ready");
  state.modes = [];
  state.status = "inactive";
  state.sessionId = null;
  state.start.mockClear();
  state.retry.mockClear();
  state.openSettings.mockClear();
  state.upload.mockReset().mockResolvedValue(undefined);
  state.download.mockReset().mockResolvedValue(undefined);
  state.pickFile.mockReset().mockResolvedValue("/tmp/meeting.wav");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(["session", "note"], { id: "note", words: [] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
});

describe("transcription controls use central readiness", () => {
  it.each(["checking", "error"] as const)(
    "blocks a %s start while leaving header configuration reachable",
    async status => {
      state.live = modelAvailability(status);
      await render(<TranscriptionBar sessionId="onboard" />);
      expect(button("Transcribe").disabled).toBe(true);
      const configure = document.querySelector("button[aria-label=\"More settings\"]") as HTMLButtonElement;
      expect(configure.disabled).toBe(false);
      expect(document.body.textContent).not.toContain("Not downloaded");
      await act(async () => configure.click());
      expect(button("Select model").getAttribute("data-trigger-variant")).toBe("field");
      await act(async () => configure.click());
      if (status === "error") {
        await act(async () => button("Retry").click());
        expect(state.retry).toHaveBeenCalledOnce();
      }
      await act(async () => button("Transcribe").click());
      expect(state.start).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      ["en", english, "Transcribe", "Ready"],
      ["es", spanish, "Transcribir", "Listo"],
    ] as const,
  )(
    "keeps ready transcription quiet in %s while preserving permitted start",
    async (locale, messages, label, ready) => {
      i18n.load(locale, messages);
      i18n.activate(locale);
      state.live = modelAvailability("ready", "native-fallback", { canSelect: false });
      await render(<TranscriptionBar sessionId="note" />);
      expect(container.querySelector("[role=\"status\"]")).toBeNull();
      expect(button(label).disabled).toBe(false);
      expect(button(label).title).toBe(ready);
      await act(async () => button(label).click());
      expect(state.start).toHaveBeenCalledWith("note");
    },
  );

  it("keeps the transcript's picker and retry available after a failed readiness read", async () => {
    state.live = modelAvailability("error");
    await render(<TranscriptView />);
    expect(button("Start transcribing").disabled).toBe(true);
    expect(button("Select model").disabled).toBe(false);
    expect(document.body.textContent).not.toContain("Not downloaded");
    await act(async () => button("Retry").click());
    expect(state.retry).toHaveBeenCalledOnce();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("uses central cloud readiness for the legacy start control and leaves settings openable", async () => {
    state.live = modelAvailability("needs-api-key");
    await render(<ListenButton sessionId="note" />);
    const start = container.querySelector("button")!;
    expect(start.disabled).toBe(true);
    expect(button("Open Settings").disabled).toBe(false);
    await act(async () => start.click());
    expect(state.start).not.toHaveBeenCalled();
  });

  it("downloads only when the shared policy permits the native artifact action", async () => {
    state.live = modelAvailability("checking");
    await render(<DownloadProbe />);
    await act(async () => downloadActions.downloadModel("balanced"));
    expect(state.download).not.toHaveBeenCalled();
    state.live = modelAvailability("needs-download");
    await render(<DownloadProbe />);
    await act(async () => downloadActions.downloadModel("balanced"));
    expect(state.download).toHaveBeenCalledExactlyOnceWith("QuantizedLargeTurbo");
    await act(async () => downloadActions.downloadModel("assemblyai-universal"));
    expect(state.download).toHaveBeenCalledTimes(1);
  });

  it("uses recorded-mode readiness rather than live readiness or any downloaded model", async () => {
    state.live = modelAvailability("ready");
    state.recorded = modelAvailability("unavailable", "recorded-fallback-required");
    const content = () => <AudioUploadDialog open onOpenChange={vi.fn()} sessionId="note" />;
    await render(content());
    const browse = document.querySelector(".cursor-pointer") as HTMLElement;
    await act(async () => browse.click());
    expect(state.modes).toContain("recorded");
    expect(button("Transcribe").disabled).toBe(true);
    expect(button("Open Settings").disabled).toBe(false);
    await act(async () => button("Transcribe").click());
    expect(state.upload).not.toHaveBeenCalled();
    state.recorded = modelAvailability("ready", "native-fallback");
    await render(content());
    expect(button("Transcribe").disabled).toBe(false);
    await act(async () => button("Transcribe").click());
    expect(state.upload).toHaveBeenCalledWith("/tmp/meeting.wav", "meeting.wav", "note");
  });
});
