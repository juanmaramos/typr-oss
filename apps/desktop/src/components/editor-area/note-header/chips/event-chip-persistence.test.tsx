// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event, Session, SessionNoteUpdate } from "@typr/plugin-db";
import { formatSimpleDateWithTime } from "@typr/utils/datetime";
import { createSessionStore, type SessionStore } from "@typr/utils/stores";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { useShallow } from "zustand/shallow";

import { messages } from "@/locales/en/messages.po";
import { EventChip } from "./event-chip";

const mocks = vi.hoisted(() => ({
  sessionGetEvent: vi.fn(), getSession: vi.fn(), updateSessionNoteFields: vi.fn(),
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "test-user" }) }));
vi.mock("@typr/plugin-db", () => ({ commands: mocks }));
vi.mock("@typr/plugin-misc", () => ({ commands: { parseMeetingLink: async () => null } }));
vi.mock("@typr/plugin-apple-calendar", () => ({ commands: {} }));
vi.mock("@typr/utils/contexts", () => ({
  useSession: <T,>(_id: string, selector: (state: ReturnType<SessionStore["getState"]>) => T) =>
    useStore(store, useShallow(selector)),
}));

let store: SessionStore;
let persisted: Session;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const createdAt = "2026-11-05T10:00:00Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T11:00:00Z"));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  notifyManager.setNotifyFunction(callback => act(callback));
  i18n.loadAndActivate({ locale: "en", messages });
  persisted = {
    id: "date-regression", user_id: "test-user", created_at: createdAt, visited_at: createdAt,
    title: "", raw_memo_html: "", enhanced_memo_html: null, auto_enhanced_memo_html: null,
    calendar_event_id: null, words: [], record_start: null, record_end: null,
    pre_meeting_memo_html: null, source_type: "manual", source_metadata: null,
    space_id: null, needs_enhance: false,
  };
  mocks.sessionGetEvent.mockResolvedValue(null);
  mocks.getSession.mockImplementation(async () => ({ ...persisted }));
  mocks.updateSessionNoteFields.mockImplementation(async (_id: string, updates: SessionNoteUpdate[]) => {
    for (const update of updates) persisted = { ...persisted, [update.field]: update.value };
    return { ...persisted };
  });
  store = createSessionStore({ ...persisted });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setNotifyFunction(callback => callback());
  vi.useRealTimers();
});

async function render(key = "initial") {
  await act(async () => root.render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <EventChip key={key} sessionId={persisted.id} />
      </QueryClientProvider>
    </I18nProvider>,
  ));
}

async function editAndSave(html: string) {
  await act(async () => {
    store.getState().updateRawNote(html);
    await store.getState().persistSession(undefined, true);
  });
}

describe("note header creation date", () => {
  it("keeps the original date when an empty note is typed in, cleared, and reopened later", async () => {
    await render();
    const originalLabel = formatSimpleDateWithTime(createdAt);
    expect(host.textContent).toBe(originalLabel);

    vi.setSystemTime(new Date("2026-11-05T11:30:00Z"));
    await editAndSave("<p>word</p>");
    expect(host.textContent).toBe(originalLabel);
    expect(persisted.raw_memo_html).toBe("<p>word</p>");
    expect(persisted.created_at).toBe(createdAt);

    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    await editAndSave("<p></p>");
    expect(host.textContent).toBe(originalLabel);
    expect(persisted.raw_memo_html).toBe("<p></p>");
    expect(persisted.created_at).toBe(createdAt);

    store = createSessionStore({ ...persisted });
    await render("reopened");
    expect(host.textContent).toBe(originalLabel);
    expect(store.getState().session.created_at).toBe(createdAt);
  });

  it("keeps the linked meeting date while the note contents change", async () => {
    const event: Event = {
      id: "meeting", user_id: "test-user", tracking_id: "meeting", calendar_id: null,
      name: "Meeting", note: "", start_date: "2026-11-04T09:00:00Z",
      end_date: "2026-11-04T10:00:00Z", google_event_url: null,
    };
    mocks.sessionGetEvent.mockResolvedValue(event);
    client.setQueryData(["event", persisted.id], { ...event, meetingLink: null });
    await render();
    const meetingDate = formatSimpleDateWithTime(event.start_date);
    await vi.waitFor(() => expect(host.textContent).toBe(meetingDate));
    await editAndSave("<p>word</p>");
    expect(host.textContent).toBe(meetingDate);
    await editAndSave("<p></p>");
    expect(host.textContent).toBe(meetingDate);
    expect(persisted.created_at).toBe(createdAt);
  });
});
