// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listen: vi.fn(),
  toastLoading: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  getSession: vi.fn(),
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("sonner", () => ({ toast: { loading: mocks.toastLoading, success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@tanstack/react-router", () => ({ useMatch: () => ({ params: { id: "session-1" } }) }));
vi.mock("@typr/plugin-db", () => ({ commands: { getSession: mocks.getSession, upsertSession: vi.fn() } }));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user-1" }) }));
vi.mock("@typr/utils/contexts", () => ({ useOngoingSession: (selector: (state: object) => unknown) => selector({
  sessionId: null, start: vi.fn(), status: "inactive", loading: false,
}) }));
vi.mock("@/hooks/useRecordingTimer", () => ({ useRecordingTimer: () => ({ remaining: 0, isWarning: false, isDanger: false, shouldShowTimer: false }) }));
vi.mock("../hooks/useTranscriptWidget", () => ({ useTranscriptWidget: () => ({ showEmptyMessage: true, hasTranscript: false, isLive: false, words: [] }) }));
vi.mock("@/contexts/audio-upload", () => ({ useAudioUpload: () => ({ openAudioUpload: vi.fn() }) }));
vi.mock("@/stores/audio-upload", () => ({ useAudioUploadStore: () => ({ progress: { status: "idle" } }) }));
vi.mock("@/hooks/useModelState", () => ({ useModelState: () => ({ models: [] }) }));
vi.mock("../../transcript/hooks/useSTTModel", () => ({ useSTTModel: () => ({ selectedLanguage: "en", handleLanguageChange: vi.fn(), isChanging: false }) }));
vi.mock("@typr/plugin-connector", () => ({ commands: {} }));
vi.mock("@typr/plugin-local-stt", () => ({ commands: {} }));
vi.mock("@typr/tiptap/transcript", () => ({ default: () => null }));
vi.mock("../../transcript/actions/TranscriptActionBar", () => ({ TranscriptActionBar: () => null }));
vi.mock("../../transcript/actions/STTLanguageSelector", () => ({ STTLanguageSelector: () => null }));
vi.mock("@/components/ui/ai-setup-indicator", () => ({ AISetupIndicator: () => null }));
vi.mock("@/components/ui/animated-icon-display", () => ({ AnimatedIconDisplay: () => null, BUTTON_VARIANTS: {}, CONTENT_VARIANTS: {} }));
vi.mock("@/components/ui/loader", () => ({ Loader: () => null }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@typr/ui/components/ui/button", () => ({ Button: ({ children }: { children: unknown }) => children }));
vi.mock("@typr/ui/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@typr/ui/components/ui/popover", () => ({ Popover: ({ children }: { children: unknown }) => children, PopoverContent: () => null, PopoverTrigger: ({ children }: { children: unknown }) => children }));
vi.mock("motion/react", () => ({ motion: { div: "div", p: "p" } }));

import { TranscriptView } from "./transcript-view";

type Listener = (event: { payload: { type: string; session_id: string } }) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let activeListeners: Set<Listener>;

function view() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <TranscriptView />
      </I18nProvider>
    </QueryClientProvider>
  );
}

describe("TranscriptView async session-event listener lifecycle", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    activeListeners = new Set();
    mocks.getSession.mockReturnValue(new Promise(() => {}));
    mocks.listen.mockReset().mockImplementation(async (_name: string, callback: Listener) => {
      activeListeners.add(callback);
      return () => activeListeners.delete(callback);
    });
    mocks.toastLoading.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("unlistens normally after registration completes", async () => {
    let registeredListener: Listener | null = null;
    const unlisten = vi.fn(() => {
      if (registeredListener) activeListeners.delete(registeredListener);
    });
    mocks.listen.mockImplementation(async (_name: string, callback: Listener) => {
      registeredListener = callback;
      activeListeners.add(callback);
      return unlisten;
    });

    await act(async () => {
      root.render(view());
      await Promise.resolve();
    });
    expect(activeListeners.size).toBe(1);

    act(() => root.unmount());
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);
  });

  it("unlistens and ignores queued events when native registration resolves after unmount", async () => {
    const registration = deferred<void>();
    const registeredListeners: Listener[] = [];
    const unlisten = vi.fn(() => {
      const listener = registeredListeners[0];
      if (listener) activeListeners.delete(listener);
    });
    mocks.listen.mockImplementation((_name: string, callback: Listener) => {
      registeredListeners.push(callback);
      return registration.promise.then(() => {
        activeListeners.add(callback);
        return unlisten;
      });
    });

    await act(async () => {
      root.render(view());
      await Promise.resolve();
    });
    expect(mocks.listen).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);

    act(() => root.unmount());
    registeredListeners[0]?.({ payload: { type: "transcriptProcessing", session_id: "session-1" } });
    expect(mocks.toastLoading).not.toHaveBeenCalled();

    await act(async () => {
      registration.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(activeListeners.size).toBe(0);
  });

  it("handles native registration failures", async () => {
    const failure = new Error("listen failed");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listen.mockRejectedValue(failure);

    await act(async () => {
      root.render(view());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(errorSpy).toHaveBeenCalledWith("[events] Failed to register transcript listener", failure);
  });
});
