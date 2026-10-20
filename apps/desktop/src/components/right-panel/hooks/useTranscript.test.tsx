// @vitest-environment jsdom
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SessionEvent } from "@typr/plugin-listener";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { sessionId: "a", status: "running_active" },
  listen: vi.fn(),
  getSession: vi.fn(async () => ({ words: [] })),
}));
vi.mock("@typr/plugin-listener", () => ({ events: { sessionEvent: { listen: mocks.listen } } }));
vi.mock("@typr/plugin-db", () => ({ commands: { getSession: mocks.getSession } }));
vi.mock(
  "@typr/utils/contexts",
  () => ({ useOngoingSession: (selector: (state: object) => unknown) => selector(mocks.session) }),
);
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/utils/telemetry", () => ({ captureTelemetryException: vi.fn() }));
import { useTranscript } from "./useTranscript";

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
let listener: (event: { payload: SessionEvent }) => void;
let value: ReturnType<typeof useTranscript>;
let route: string;
function Probe() {
  value = useTranscript(route);
  return null;
}
const word = (text: string) => ({ text, speaker: null, confidence: null, start_ms: null, end_ms: null });
async function render() {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
    await Promise.resolve();
  });
}
async function fire(payload: SessionEvent) {
  await act(async () => listener({ payload }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  route = "a";
  Object.assign(mocks.session, { sessionId: "a", status: "running_active" });
  mocks.listen.mockImplementation(async (callback) => {
    listener = callback;
    return vi.fn();
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  container = document.createElement("div");
  root = createRoot(container);
  notifyManager.setNotifyFunction(callback => act(() => callback()));
});
afterEach(async () => {
  await act(async () => root.unmount());
  queryClient.clear();
  notifyManager.setNotifyFunction(callback => callback());
  vi.unstubAllGlobals();
});

describe("streaming transcript ownership", () => {
  it("replaces each channel's hypothesis without changing durable words or query data", async () => {
    await render();
    await vi.waitFor(() => expect(queryClient.getQueryState(["session", "a"])?.status).toBe("success"));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await fire({ type: "words", words: [word("committed")] });
    await fire({ type: "preview", session_id: "a", channel: "mic", words: [word("Hello")] });
    await fire({ type: "preview", session_id: "a", channel: "speaker", words: [word("Hola")] });
    await fire({ type: "preview", session_id: "a", channel: "mic", words: [word("Hello there")] });
    expect(value.words).toEqual([word("committed")]);
    expect(value.previews).toEqual({ mic: [word("Hello there")], speaker: [word("Hola")] });
    expect(queryClient.getQueryData(["session", "a"])).not.toEqual(
      expect.arrayContaining([word("Hello there")]),
    );
    await fire({ type: "words", words: [word("committed"), word("Hello there")] });
    await fire({ type: "preview", session_id: "a", channel: "mic", words: [] });
    expect(value.previews.mic).toEqual([]);
    expect(value.previews.speaker).toEqual([word("Hola")]);
    expect(value.words).toEqual([word("committed"), word("Hello there")]);
    await fire({ type: "inactive" });
    expect(value.previews).toEqual({});
  });

  it("clears on pause, restart and navigation and rejects stale session or disposed listeners", async () => {
    await render();
    await fire({ type: "preview", session_id: "a", channel: "mic", words: [word("temporary")] });
    const previousListener = listener;
    mocks.session.status = "running_paused";
    await render();
    expect(value.previews).toEqual({});
    mocks.session.status = "running_active";
    await render();
    expect(value.previews).toEqual({});
    await act(async () =>
      previousListener({ payload: { type: "preview", session_id: "a", channel: "mic", words: [word("late")] } })
    );
    expect(value.previews).toEqual({});
    route = "b";
    mocks.session.sessionId = "b";
    await render();
    await fire({ type: "preview", session_id: "a", channel: "mic", words: [word("wrong note")] });
    expect(value.previews).toEqual({});
    await fire({ type: "preview", session_id: "b", channel: "mic", words: [word("new note")] });
    expect(value.previews.mic).toEqual([word("new note")]);
    mocks.session.status = "inactive";
    await render();
    expect(value.previews).toEqual({});
  });
});
