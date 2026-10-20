// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { sessionId: "session-1" as string | null, status: "running_active", loading: false },
  start: vi.fn(), stop: vi.fn(), downloaded: vi.fn(), setSession: vi.fn(), clearSession: vi.fn(),
  setDefault: vi.fn(), setLocalDefault: vi.fn(),
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user-1" }) }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@typr/utils/contexts", () => ({
  useOngoingSession: (selector: (state: object) => unknown) => selector({ ...mocks.session, start: mocks.start, stop: mocks.stop }),
}));
vi.mock("@typr/plugin-listener", () => ({ events: { sessionEvent: { listen: vi.fn(async () => vi.fn()) } } }));
vi.mock("@typr/plugin-local-stt", () => ({ commands: {
  isModelDownloaded: mocks.downloaded, setCurrentModel: mocks.setLocalDefault,
} }));
vi.mock("@typr/plugin-connector", () => ({ commands: {
  setSttModelSession: mocks.setSession, clearSttModelSession: mocks.clearSession, setSttModel: mocks.setDefault,
} }));
vi.mock("@typr/ui/components/ui/toast", () => ({ sonnerToast: {
  dismiss: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn(),
} }));

import { useTranscriptionFallback } from "./useTranscriptionFallback";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
let fallback: ReturnType<typeof useTranscriptionFallback>;
function Harness() { fallback = useTranscriptionFallback(); return null; }
let root: Root;
let container: HTMLDivElement;
const render = () => act(async () => {
  root.render(createElement(I18nProvider, { i18n }, createElement(Harness)));
});
const fail = async () => {
  let result = false;
  await act(async () => { result = await fallback.handleCloudFailure("reconnect_exhausted", "assemblyai-universal"); });
  return result;
};

describe("session-scoped transcription recovery", () => {
  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.session = { sessionId: "session-1", status: "running_active", loading: false };
    mocks.downloaded.mockResolvedValue(true);
    mocks.setSession.mockResolvedValue(null);
    mocks.clearSession.mockResolvedValue(null);
    mocks.stop.mockImplementation(() => { mocks.session.loading = true; });
    mocks.start.mockImplementation((sessionId: string) => { mocks.session = { sessionId, status: "inactive", loading: true }; });
    container = document.createElement("div");
    root = createRoot(container);
    await render();
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it("waits for inactivity and preserves defaults while setting and clearing only its session override", async () => {
    expect(await fail()).toBe(true);
    expect(mocks.stop).toHaveBeenCalledOnce();
    await render();
    expect(mocks.setSession).not.toHaveBeenCalled();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    expect(mocks.setSession).toHaveBeenCalledExactlyOnceWith("session-1", "QuantizedLargeTurbo");
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith("session-1");
    expect(mocks.setDefault).not.toHaveBeenCalled();
    expect(mocks.setLocalDefault).not.toHaveBeenCalled();
    expect(mocks.clearSession).not.toHaveBeenCalled();
    await render(); // inactive + loading during the replacement start
    expect(mocks.clearSession).not.toHaveBeenCalled();
    mocks.session = { sessionId: "session-1", status: "running_active", loading: false };
    await render();
    expect(mocks.clearSession).not.toHaveBeenCalled();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    expect(mocks.clearSession).toHaveBeenCalledExactlyOnceWith("session-1");
  });

  it("does not start before native session selection is ready or clear it during preparation", async () => {
    let finishSelection!: () => void;
    mocks.setSession.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSelection = resolve; }));
    await fail();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    expect(mocks.start).not.toHaveBeenCalled();
    await render();
    expect(mocks.clearSession).not.toHaveBeenCalled();
    await act(async () => finishSelection());
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith("session-1");
  });

  it("clears its override and keeps defaults if native selection fails", async () => {
    mocks.setSession.mockRejectedValueOnce(new Error("selection failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await fail();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    expect(mocks.clearSession).toHaveBeenCalledExactlyOnceWith("session-1");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.setDefault).not.toHaveBeenCalled();
    expect(mocks.setLocalDefault).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(["stopping", "inactive"])("does not recover when the user is %s during the download check", async (phase) => {
    let finishCheck!: (value: boolean) => void;
    mocks.downloaded.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    let pending!: Promise<boolean>;
    await act(async () => { pending = fallback.handleCloudFailure("failed", "assemblyai-universal"); });
    mocks.session = phase === "stopping"
      ? { sessionId: "session-1", status: "running_active", loading: true }
      : { sessionId: null, status: "inactive", loading: false };
    await render();
    await act(async () => finishCheck(true));
    expect(await pending).toBe(false);
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not restart after unmount during native selection, even if selection finishes later", async () => {
    let finishSelection!: () => void;
    mocks.setSession.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSelection = resolve; }));
    await fail();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    await act(async () => root.render(null));
    await act(async () => finishSelection());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.clearSession).toHaveBeenCalledWith("session-1");
  });

  it("cancels if another session starts during selection and only clears the failed session", async () => {
    let finishSelection!: () => void;
    mocks.setSession.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSelection = resolve; }));
    await fail();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    mocks.session = { sessionId: "session-2", status: "running_active", loading: false };
    await render();
    await act(async () => finishSelection());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.clearSession).toHaveBeenCalledWith("session-1");
    expect(mocks.clearSession).not.toHaveBeenCalledWith("session-2");
  });

  it("coalesces duplicate failures and clears its override if the replacement start fails", async () => {
    await fail();
    expect(await fail()).toBe(false);
    expect(mocks.stop).toHaveBeenCalledOnce();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    await render();
    mocks.session = { sessionId: null, status: "inactive", loading: false };
    await render();
    expect(mocks.clearSession).toHaveBeenCalledExactlyOnceWith("session-1");
  });
});
