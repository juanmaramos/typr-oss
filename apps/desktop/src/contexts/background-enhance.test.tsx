// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@typr/plugin-db";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), listSessions: vi.fn(), upsertSession: vi.fn(), saveRecordingSummary: vi.fn(),
  streamText: vi.fn(), render: vi.fn(), refresh: vi.fn(), getTemplate: vi.fn(), setShowRaw: vi.fn(),
}));
const windowState = vi.hoisted(() => ({ label: "main" }));
const modelState = vi.hoisted(() => ({ templateType: "Cloud" }));
// Exercise the real writing bar without waiting on Motion's exit-animation clock.
vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@typr/plugin-windows", () => ({ getCurrentWebviewWindowLabel: () => windowState.label }));
vi.mock("@/contexts", () => ({
  useTypr: () => ({ userId: "user-1" }), useRightPanel: () => ({ showSidebar: vi.fn() }),
}));
vi.mock("@typr/plugin-db", () => ({ commands: { ...mocks, sessionListParticipants: async () => [] } }));
vi.mock("@typr/plugin-config", () => ({ commands: { getGeneralConfig: async () => ({ selected_template_id: "default" }) } }));
vi.mock("@typr/plugin-template", () => ({ commands: { render: mocks.render } }));
vi.mock("@typr/plugin-misc", () => ({ commands: { opinionatedMdToHtml: async (text: string) => `<p>${text}</p>` } }));
vi.mock("@/utils/template-service", () => ({ TemplateService: {
  getTemplate: mocks.getTemplate, initializeDefaultFavorites: vi.fn(), getTemplatesForPopover: async () => [],
} }));
vi.mock("@typr/utils", () => ({ CLOUD_GENERATION_TOKEN_BUDGETS: { meetingNotes: 100 } }));
vi.mock("@typr/utils/ai", () => ({
  streamText: mocks.streamText, getTemplateTypeForTask: async () => modelState.templateType, localProviderName: "local",
  modelProvider: async () => ({ languageModel: () => ({}) }), generateText: vi.fn(),
}));
const stores = { recorded: { getState: () => ({ refresh: mocks.refresh, setShowRaw: mocks.setShowRaw }) } };
vi.mock("@typr/utils/contexts", () => ({
  useSessions: (selector: (state: object) => unknown) => selector({ sessions: stores }),
  useSession: (id: string, selector: (state: object) => unknown) => selector({ ...noteState, session: { ...session, id } }),
}));
vi.mock("@/stores/audio-upload", () => ({ useAudioUploadStore: { getState: () => ({ progress: { status: "idle" } }) } }));
vi.mock("@/hooks/use-agent-writing-feature", () => ({ useAgentWritingFeature: () => false }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@typr/plugin-connector", () => ({ commands: { getLlmConnection: async () => ({ type: "TyprLocal" }) } }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));
vi.mock("@typr/tiptap/editor", async () => ({ default: (await import("react")).forwardRef(() => null) }));
vi.mock("@typr/tiptap/renderer", async () => ({ default: (await import("react")).forwardRef(() => null) }));
vi.mock("@typr/tiptap/shared", () => ({ extractHashtags: () => [] }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/toast/shared", () => ({ enhanceFailedToast: vi.fn() }));
vi.mock("@/components/right-panel/components/search/search-header", () => ({ SearchHeader: () => null }));
vi.mock("@/components/editor-area/selection-actions", () => ({ SelectionActions: () => null }));
vi.mock("@/components/editor-area/note-header", () => ({
  NoteHeader: ({ isGeneratingAiNotes }: { isGeneratingAiNotes: boolean }) =>
    createElement("header", { "data-generating": isGeneratingAiNotes }),
}));

import { BackgroundEnhanceWorker } from "./background-enhance";
import EditorArea from "@/components/editor-area";
import { useBackgroundEnhanceStore } from "@/stores/background-enhance";
import { useEnhancePendingState } from "@/hooks/enhance-pending";

let root: Root;
let host: HTMLDivElement;
let session: Session;
let queryClient: QueryClient;
const noteState = {
  showRaw: true, setShowRaw: mocks.setShowRaw, refresh: mocks.refresh,
  updateRawNote: vi.fn(), updateEnhancedNote: vi.fn(), snapshotAutoEnhanced: vi.fn(),
  restoreAutoEnhanced: vi.fn(), restoreEnhancedNote: vi.fn(), persistSession: vi.fn(),
};
const i18n = setupI18n({ locale: "en", messages: { en: {} } });
const successfulStream = () => ({ fullStream: (async function* () {
  yield { type: "text-delta", textDelta: "Meeting summary" };
  yield { type: "finish", finishReason: "stop" };
})() });

function PendingControls({ sessionId }: { sessionId: string }) {
  const pending = useEnhancePendingState(sessionId);
  return createElement("button", { disabled: pending, "data-pending-control": true });
}

function render(note = "recorded") {
  root.render(createElement(I18nProvider, { i18n },
    createElement(QueryClientProvider, { client: queryClient },
      createElement(BackgroundEnhanceWorker, { children: createElement("div", {},
        createElement(EditorArea, { sessionId: note, editable: false }),
        createElement(PendingControls, { sessionId: note }),
      ) }))));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useBackgroundEnhanceStore.setState({ phases: {} });
  windowState.label = "main";
  modelState.templateType = "Cloud";
  session = {
    id: "recorded", user_id: "user-1", created_at: "2026-01-01T00:00:00Z", visited_at: "2026-01-01T00:00:00Z",
    calendar_event_id: null, title: "Existing title", raw_memo_html: "My notes", enhanced_memo_html: null,
    auto_enhanced_memo_html: null, words: Array.from({ length: 5 }, (_, i) => ({
      text: `word ${i}`, start_ms: null, end_ms: null, speaker: null, confidence: null,
    })), record_start: "2026-01-01T01:00:00+00:00", record_end: "2026-01-01T01:30:00+00:00",
    pre_meeting_memo_html: null, source_type: "manual", source_metadata: '{"summary_template_id":"chosen"}',
    space_id: null, needs_enhance: true,
  };
  mocks.listSessions.mockImplementation(async () => session.needs_enhance ? [session] : []);
  mocks.getSession.mockImplementation(async () => ({ ...session }));
  mocks.saveRecordingSummary.mockImplementation(async () => { session.needs_enhance = false; return true; });
  mocks.getTemplate.mockResolvedValue(null);
  mocks.render.mockResolvedValue("prompt");
  mocks.streamText.mockImplementation(successfulStream);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  queryClient = new QueryClient();
  await act(async () => render());
});

afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  host.remove();
  vi.useRealTimers();
});

describe("recording background summary completion", () => {
  it.each(["TyprLocal", "Cloud"])("shows the editor's animation before the first token through saving (%s)", async (templateType) => {
    modelState.templateType = templateType;
    let startWriting!: () => void;
    let finishWriting!: () => void;
    let finishSaving!: () => void;
    const firstToken = new Promise<void>((resolve) => { startWriting = resolve; });
    const lastToken = new Promise<void>((resolve) => { finishWriting = resolve; });
    const saved = new Promise<void>((resolve) => { finishSaving = resolve; });
    mocks.streamText.mockImplementation(() => ({ fullStream: (async function* () {
      await firstToken;
      yield { type: "text-delta", textDelta: "Summary" };
      await lastToken;
      yield { type: "finish", finishReason: "stop" };
    })() }));
    mocks.saveRecordingSummary.mockImplementation(async () => { await saved; return true; });

    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(host.textContent).toContain("Preparing notes");
    expect(host.querySelector("header")?.getAttribute("data-generating")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>("[data-pending-control]")?.disabled).toBe(true);
    expect(host.querySelector("[aria-label]")).toBeNull(); // Background work has no foreground cancel action.

    await act(async () => startWriting());
    expect(host.textContent).toContain("Writing notes");
    await act(async () => render("another-note"));
    expect(host.querySelector('[data-session-id="another-note"]')).toBeNull();
    expect(host.querySelector("header")?.getAttribute("data-generating")).toBe("false");
    expect(host.querySelector<HTMLButtonElement>("[data-pending-control]")?.disabled).toBe(false);
    await act(async () => render());
    expect(host.textContent).toContain("Writing notes");

    await act(async () => finishWriting());
    expect(host.textContent).toContain("Finalizing");
    expect(mocks.saveRecordingSummary).toHaveBeenCalledTimes(1);
    await act(async () => finishSaving());
    expect(host.querySelector('[data-session-id="recorded"]')).toBeNull();
    expect(host.querySelector("header")?.getAttribute("data-generating")).toBe("false");
  });

  it("clears progress when a stale summary is rejected", async () => {
    mocks.saveRecordingSummary.mockResolvedValueOnce(false);
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(useBackgroundEnhanceStore.getState().phases.recorded).toBeUndefined();
    expect(mocks.setShowRaw).not.toHaveBeenCalled();
  });

  it("leaves recorded-session generation to the main window", async () => {
    windowState.label = "note-detached";
    await act(async () => render());
    await act(async () => vi.advanceTimersByTimeAsync(12_000));
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.saveRecordingSummary).not.toHaveBeenCalled();
    expect(session.needs_enhance).toBe(true);
  });

  it("summarizes the finalized session after note navigation and saves only once", async () => {
    await act(async () => render("another-note"));
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.saveRecordingSummary).toHaveBeenCalledWith("recorded", session.words, session.record_end, null, "<p>Meeting summary</p>");
    expect(mocks.getTemplate).toHaveBeenCalledWith("chosen");
    expect(mocks.render).toHaveBeenCalledWith("enhance.user", expect.objectContaining({ editor: "My notes", words: JSON.stringify(session.words) }));
    expect(mocks.upsertSession).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(mocks.saveRecordingSummary).toHaveBeenCalledTimes(1);
  });

  it("leaves durable pending state during generation and prevents overlapping polls", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    mocks.streamText.mockImplementation(() => ({ fullStream: (async function* () {
      yield { type: "text-delta", textDelta: "Final" };
      await waiting;
      yield { type: "finish", finishReason: "stop" };
    })() }));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(session.needs_enhance).toBe(true);
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecordingSummary).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(mocks.saveRecordingSummary).toHaveBeenCalledTimes(1);
  });

  it("retries failed generation from durable pending state after backoff", async () => {
    mocks.streamText.mockImplementationOnce(() => ({ fullStream: (async function* () {
      yield { type: "error", error: new Error("offline") };
    })() }));
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(session.needs_enhance).toBe(true);
    expect(useBackgroundEnhanceStore.getState().phases.recorded).toBeUndefined();
    expect(host.querySelector("header")?.getAttribute("data-generating")).toBe("false");
    await act(async () => vi.advanceTimersByTimeAsync(58_000));
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.listSessions).toHaveBeenLastCalledWith(expect.objectContaining({ exclude_ids: ["recorded"], limit: 10 }));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(mocks.saveRecordingSummary).toHaveBeenCalledTimes(1);
    expect(session.needs_enhance).toBe(false);
  });

  it("does not publish an incomplete stream or an active recording", async () => {
    mocks.streamText.mockImplementationOnce(() => ({ fullStream: (async function* () {
      yield { type: "text-delta", textDelta: "Partial output" };
    })() }));
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.saveRecordingSummary).not.toHaveBeenCalled();
    expect(session.needs_enhance).toBe(true);
    session.record_end = null;
    await act(async () => vi.advanceTimersByTimeAsync(65_000));
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
  });
});
