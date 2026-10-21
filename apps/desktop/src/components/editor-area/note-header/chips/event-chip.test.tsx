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
  session: { id: "note", created_at: "2026-05-15T15:00:43Z", record_start: "2026-10-21T09:00:55Z" as string | null },
  event: null as { start_date: string; calendar_id: null; note: string } | null,
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user", onboardingSessionId: "welcome" }) }));
vi.mock("@typr/utils/contexts", () => ({
  useSession: (_id: string, selector: (state: object) => unknown) =>
    selector({ session: state.session, updateTitle: vi.fn() }),
}));
vi.mock("@typr/plugin-db", () => ({ commands: { sessionGetEvent: async () => state.event } }));
vi.mock("@typr/plugin-misc", () => ({ commands: { parseMeetingLink: async () => null } }));
vi.mock("@typr/plugin-apple-calendar", () => ({ commands: {} }));
import { EventChip } from "./event-chip";

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  notifyManager.setScheduler(callback => callback());
  state.session.record_start = "2026-10-21T09:00:55Z";
  state.event = null;
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
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
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.session.created_at));
  });
  it("keeps a linked calendar event as the date reference", async () => {
    state.event = { start_date: "2026-10-22T14:00:00Z", calendar_id: null, note: "" };
    await render();
    expect(host.textContent).toContain(formatSimpleDateWithTime(state.event.start_date));
  });
});
