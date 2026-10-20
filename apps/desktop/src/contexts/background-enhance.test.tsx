// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@typr/plugin-db";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), listSessions: vi.fn(), upsertSession: vi.fn(), saveRecordingSummary: vi.fn(),
  streamText: vi.fn(), render: vi.fn(), refresh: vi.fn(), getTemplate: vi.fn(), setShowRaw: vi.fn(),
}));
const windowState = vi.hoisted(() => ({ label: "main" }));
vi.mock("@typr/plugin-windows", () => ({ getCurrentWebviewWindowLabel: () => windowState.label }));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user-1" }) }));
vi.mock("@typr/plugin-db", () => ({ commands: { ...mocks, sessionListParticipants: async () => [] } }));
vi.mock("@typr/plugin-config", () => ({ commands: { getGeneralConfig: async () => ({ selected_template_id: "default" }) } }));
vi.mock("@typr/plugin-template", () => ({ commands: { render: mocks.render } }));
vi.mock("@typr/plugin-misc", () => ({ commands: { opinionatedMdToHtml: async (text: string) => `<p>${text}</p>` } }));
vi.mock("@/utils/template-service", () => ({ TemplateService: { getTemplate: mocks.getTemplate } }));
vi.mock("@typr/utils", () => ({ CLOUD_GENERATION_TOKEN_BUDGETS: { meetingNotes: 100 } }));
vi.mock("@typr/utils/ai", () => ({
  streamText: mocks.streamText, getTemplateTypeForTask: async () => "Cloud", localProviderName: "local",
  modelProvider: async () => ({ languageModel: () => ({}) }), generateText: vi.fn(),
}));
const stores = { recorded: { getState: () => ({ refresh: mocks.refresh, setShowRaw: mocks.setShowRaw }) } };
vi.mock("@typr/utils/contexts", () => ({ useSessions: (selector: (state: object) => unknown) => selector({ sessions: stores }) }));
vi.mock("@/stores/audio-upload", () => ({ useAudioUploadStore: { getState: () => ({ progress: { status: "idle" } }) } }));

import { BackgroundEnhanceWorker } from "./background-enhance";

let root: Root;
let host: HTMLDivElement;
let session: Session;
let queryClient: QueryClient;
const successfulStream = () => ({ fullStream: (async function* () {
  yield { type: "text-delta", textDelta: "Meeting summary" };
  yield { type: "finish", finishReason: "stop" };
})() });

function render(note = "recorded") {
  root.render(createElement(QueryClientProvider, { client: queryClient },
    createElement(BackgroundEnhanceWorker, { children: createElement("div", {}, note) })));
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  windowState.label = "main";
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
