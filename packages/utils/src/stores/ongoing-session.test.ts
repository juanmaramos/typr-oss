import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSummaryTemplate: vi.fn(), stopSession: vi.fn(async () => {}),
  listen: vi.fn(async (_callback: unknown) => () => {}),
}));
vi.mock("@typr/plugin-db", () => ({ commands: { setSummaryTemplate: mocks.setSummaryTemplate } }));
vi.mock("@typr/plugin-listener", () => ({
  commands: { stopSession: mocks.stopSession }, events: { sessionEvent: { listen: mocks.listen } },
}));

import { createOngoingSessionStore } from "./ongoing-session";
import { createSessionsStore } from "./sessions";

describe("recording summary template lifecycle", () => {
  it("persists the selected template for the recording before manual stop", async () => {
    let finishWrite!: () => void;
    mocks.setSummaryTemplate.mockReturnValueOnce(new Promise<void>((resolve) => { finishWrite = resolve; }));
    mocks.stopSession.mockClear();
    const store = createOngoingSessionStore(createSessionsStore());
    store.setState({ sessionId: "recording", status: "running_active" });
    store.getState().setAutoEnhanceTemplate("selected");
    store.getState().stop();
    await Promise.resolve();
    expect(mocks.setSummaryTemplate).toHaveBeenCalledWith("recording", "selected");
    expect(mocks.stopSession).not.toHaveBeenCalled();
    finishWrite();
    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledOnce());
  });

  it("does not bind a template selection to another or inactive recording", async () => {
    mocks.setSummaryTemplate.mockClear();
    mocks.setSummaryTemplate.mockResolvedValue(undefined);
    const store = createOngoingSessionStore(createSessionsStore());
    store.getState().setAutoEnhanceTemplate("unbound");
    expect(mocks.setSummaryTemplate).not.toHaveBeenCalled();
    store.setState({ sessionId: "first", status: "running_active" });
    store.getState().setAutoEnhanceTemplate(null);
    store.setState({ sessionId: "second" });
    await vi.waitFor(() => expect(mocks.setSummaryTemplate).toHaveBeenCalledWith("first", null));
    expect(mocks.setSummaryTemplate).toHaveBeenCalledOnce();
  });
});
