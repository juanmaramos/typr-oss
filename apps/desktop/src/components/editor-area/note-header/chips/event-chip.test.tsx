// @vitest-environment jsdom
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatSimpleDateWithTime } from "@typr/utils/datetime";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: {
    id: "note",
    created_at: "2026-05-15T15:00:43Z",
    record_start: "2026-10-21T09:00:55Z" as string | null,
    title: "",
    calendar_event_id: null as string | null,
    raw_memo_html: "",
    enhanced_memo_html: null as string | null,
    pre_meeting_memo_html: null as string | null,
    words: [] as unknown[],
    conversations: [] as unknown[],
    record_end: null as string | null,
  },
  event: null as { start_date: string; calendar_id: null; note: string } | null,
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user", onboardingSessionId: "welcome" }) }));
vi.mock("@typr/utils/contexts", () => ({
  useSession: (_id: string, selector: (state: object) => unknown) =>
    selector({ session: state.session, updateTitle: vi.fn() }),
}));
vi.mock(
  "@typr/plugin-db",
  () => ({ commands: { sessionGetEvent: async () => state.event, listEvents: async () => [] } }),
);
vi.mock("@typr/plugin-misc", () => ({ commands: { parseMeetingLink: async () => null } }));
vi.mock("@typr/plugin-apple-calendar", () => ({ commands: {} }));
import { EventChip } from "./event-chip";

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  notifyManager.setScheduler(callback => callback());
  Object.assign(state.session, {
    record_start: "2026-10-21T09:00:55Z",
    record_end: null,
    title: "",
    calendar_event_id: null,
    raw_memo_html: "",
    enhanced_memo_html: null,
    pre_meeting_memo_html: null,
    words: [],
    conversations: [],
  });
  state.event = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
});
const render = async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <EventChip sessionId="note" />
        </I18nProvider>
      </QueryClientProvider>,
    );
  });
};

describe.each([["en", english], ["es", spanish]] as const)("meeting date in %s", (locale, messages) => {
  beforeEach(() => {
    i18n.load(locale, messages);
    i18n.activate(locale);
  });
  it("uses the recording date when an older note is recorded later", async () => {
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.session.record_start!));
    expect(host.textContent).not.toContain(formatSimpleDateWithTime(state.session.created_at));
  });
  it("keeps the creation date for a note without a recording", async () => {
    state.session.record_start = null;
    state.session.raw_memo_html = "<p>Notes from today</p>";
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.session.created_at));
  });
  it("keeps a linked calendar event as the date reference", async () => {
    state.event = { start_date: "2026-10-22T14:00:00Z", calendar_id: null, note: "" };
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.event.start_date));
  });
  it("shows Now on a blank draft while keeping calendar linking accessible", async () => {
    state.session.record_start = null;
    state.session.raw_memo_html = " <p> </p> ";
    await render();
    expect(host.textContent).toBe(locale === "es" ? "Ahora" : "Now");
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.getAttribute("aria-label")).toBe(
      locale === "es" ? "Ahora: vincular evento del calendario" : "Now: link calendar event",
    );
    await act(async () => button?.click());
    expect(document.querySelector("input[placeholder]")).not.toBeNull();
    expect(state.session.created_at).toBe("2026-05-15T15:00:43Z");
  });
  it("shows the existing date after the draft gains content without changing its timestamp", async () => {
    state.session.record_start = null;
    await render();
    expect(host.textContent).toBe(locale === "es" ? "Ahora" : "Now");
    state.session.raw_memo_html = "<p>First note</p>";
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.session.created_at));
    expect(state.session.created_at).toBe("2026-05-15T15:00:43Z");
  });
  it.each([
    { title: "Project notes" },
    { enhanced_memo_html: "<p>Summary</p>" },
    { pre_meeting_memo_html: "<p>Agenda</p>" },
    { words: [{ text: "Hello" }] },
    { conversations: [{ id: "chat" }] },
    { record_end: "2026-10-21T09:30:00Z" },
    { calendar_event_id: "calendar-event" },
  ])("keeps a date on a used note with %j", async (fields) => {
    state.session.record_start = null;
    Object.assign(state.session, fields);
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.session.created_at));
  });
});
