// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type CallEndStatus } from "@typr/plugin-notification";
import { CallEndBridge } from "./call-end-bridge";
import Notifications from "./settings/views/notifications";

const commands = vi.hoisted(() => ({
  getCallEndEnabled: vi.fn(), setCallEndEnabled: vi.fn(), getCallEndStatus: vi.fn(),
  associateCall: vi.fn(), keepRecording: vi.fn(), stopAssociatedRecording: vi.fn(), showCallEndNotification: vi.fn(),
  getEventNotification: vi.fn(), getDetectNotification: vi.fn(), requestNotificationPermission: vi.fn(),
  openCallDetectionSettings: vi.fn(),
}));
vi.mock("@typr/plugin-notification", () => ({ commands }));

const source = { id: "zoom:original-process:window", label: "Zoom" };
const session_id = "f260b58a-d46e-41f8-83c8-69ba29244cf2";
const i18n = setupI18n({ locale: "en", messages: { en: {} } });
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  for (const command of Object.values(commands)) command.mockResolvedValue(null);
  commands.getCallEndEnabled.mockResolvedValue(false);
  commands.getCallEndStatus.mockResolvedValue({ type: "idle" });
  commands.getEventNotification.mockResolvedValue(false);
  commands.getDetectNotification.mockResolvedValue(false);
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  notifyManager.setScheduler(callback => callback());
  notifyManager.setNotifyFunction(callback => act(() => callback()));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 }, mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setNotifyFunction(callback => callback());
  notifyManager.setScheduler(callback => setTimeout(callback, 0));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(status?: CallEndStatus, enabled = true, settings = false) {
  client.setQueryData(["notification", "call-end"], enabled);
  if (status) client.setQueryData(["notification", "call-end-status"], status);
  await act(async () => root.render(
    <I18nProvider i18n={i18n}><QueryClientProvider client={client}>
      {settings ? <Notifications /> : <CallEndBridge />}
    </QueryClientProvider></I18nProvider>,
  ));
}

async function update(status: CallEndStatus) {
  await act(async () => { client.setQueryData(["notification", "call-end-status"], status); });
}

function button(label: string) {
  return [...host.querySelectorAll("button")].find(element => element.textContent === label)!;
}

describe("native call-end controls", () => {
  it("stays inactive when disabled, including cached countdowns", async () => {
    await render({ type: "countdown", session_id, source, remaining_seconds: 120 }, false);
    expect(host.textContent).toBe("");
    expect(commands.getCallEndStatus).not.toHaveBeenCalled();
    expect(commands.showCallEndNotification).not.toHaveBeenCalled();
  });

  it("associates only the call the user chooses", async () => {
    await render({ type: "association_required", session_id, candidates: [source, { id: "teams:other-call", label: "Microsoft Teams" }] });
    expect(commands.associateCall).not.toHaveBeenCalled();
    await act(async () => button("Microsoft Teams").click());
    expect(commands.associateCall).toHaveBeenCalledWith(session_id, "teams:other-call");
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
  });

  it("uses native remaining time, clears on rejoin and sends one background notification per end", async () => {
    await render({ type: "countdown", session_id, source, remaining_seconds: 120 });
    expect(host.textContent).toContain("2:00");
    expect(commands.showCallEndNotification).toHaveBeenCalledTimes(1);
    await update({ type: "countdown", session_id, source, remaining_seconds: 61 });
    expect(host.textContent).toContain("1:01");
    expect(commands.showCallEndNotification).toHaveBeenCalledTimes(1);
    await update({ type: "monitoring", session_id, source });
    expect(host.textContent).toBe("");
    await update({ type: "countdown", session_id, source, remaining_seconds: 120 });
    expect(commands.showCallEndNotification).toHaveBeenCalledTimes(2);
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
  });

  it("does not offer indistinguishable calls from the same app", async () => {
    await render({ type: "association_required", session_id, candidates: [source, { ...source, id: "zoom:another-window" }] });
    expect(host.textContent).toContain("More than one call is open in the same app.");
    expect(button("Zoom")).toBeUndefined();
    expect(commands.associateCall).not.toHaveBeenCalled();
    expect(button("Keep recording")).toBeDefined();
  });

  it("keeps uncertain recordings running until the user chooses", async () => {
    await render({ type: "uncertain", session_id, source });
    expect(host.textContent).toContain("Recording will continue until you choose.");
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
    await act(async () => button("Keep recording").click());
    expect(commands.keepRecording).toHaveBeenCalledWith(session_id);
  });

  it("stops the linked recording only on an explicit stop action and keeps failures visible", async () => {
    commands.stopAssociatedRecording.mockRejectedValue(new Error("stale recording"));
    await render({ type: "uncertain", session_id, source });
    await act(async () => button("Stop now").click());
    expect(commands.stopAssociatedRecording).toHaveBeenCalledWith(session_id);
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("Try again."));
    expect(host.textContent).not.toContain("stale recording");
  });

  it("shows finishing without issuing another stop", async () => {
    await render({ type: "countdown", session_id, source, remaining_seconds: 0 });
    expect(host.textContent).toContain("Finishing recording");
    expect(button("Stop now").disabled).toBe(true);
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
  });

  it("does not duplicate native notifications while the main window has focus", async () => {
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await render({ type: "uncertain", session_id, source });
    expect(commands.showCallEndNotification).not.toHaveBeenCalled();
  });

  it("defaults the opt-in switch off and shares successful changes with the bridge", async () => {
    await render(undefined, false, true);
    const toggle = host.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1];
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(commands.setCallEndEnabled).not.toHaveBeenCalled();
    await act(async () => toggle.click());
    await vi.waitFor(() => expect(commands.setCallEndEnabled).toHaveBeenCalledWith(true));
    expect(commands.requestNotificationPermission).toHaveBeenCalledOnce();
    expect(client.getQueryData(["notification", "call-end"])).toBe(true);
  });

  it("keeps the switch off and shows an error when enabling fails", async () => {
    commands.setCallEndEnabled.mockRejectedValue(new Error("store unavailable"));
    await render(undefined, false, true);
    const toggle = host.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1];
    await act(async () => toggle.click());
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("Try again."));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(client.getQueryData(["notification", "call-end"])).toBe(false);
  });

  it("explains denied permission and keeps recording after opening settings without a grant", async () => {
    commands.getCallEndStatus.mockResolvedValue({ type: "permission_required" });
    await render({ type: "permission_required" });
    expect(host.textContent).toContain("Accessibility permission needed");
    expect(host.textContent).toContain("recordings continue until you stop them");
    expect(commands.openCallDetectionSettings).not.toHaveBeenCalled();
    await act(async () => button("Open permission settings").click());
    expect(commands.openCallDetectionSettings).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Accessibility permission needed");
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
    expect(commands.associateCall).not.toHaveBeenCalled();
  });

  it("recovers after a grant without remounting and shows guidance again after revocation", async () => {
    await render({ type: "permission_required" });
    commands.getCallEndStatus.mockResolvedValue({ type: "association_required", session_id, candidates: [source] });
    await act(async () => { await client.refetchQueries({ queryKey: ["notification", "call-end-status"] }); });
    expect(host.textContent).not.toContain("Accessibility permission needed");
    expect(button("Zoom")).toBeDefined();
    await update({ type: "countdown", session_id, source, remaining_seconds: 1 });
    await update({ type: "permission_required" });
    expect(host.textContent).toContain("Accessibility permission needed");
    expect(button("Stop now")).toBeUndefined();
    expect(commands.stopAssociatedRecording).not.toHaveBeenCalled();
  });

  it("keeps failed settings actions recoverable without exposing native errors", async () => {
    commands.openCallDetectionSettings.mockRejectedValue(new Error("private native failure"));
    await render({ type: "permission_required" });
    await act(async () => button("Open permission settings").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Open System Settings");
    expect(host.textContent).not.toContain("private native failure");
    expect(button("Open permission settings").disabled).toBe(false);
  });

  it("shows the permission requirement beside the enabled setting and clears it after recovery", async () => {
    await render({ type: "permission_required" }, true, true);
    expect(button("Open permission settings")).toBeDefined();
    await update({ type: "idle" });
    expect(button("Open permission settings")).toBeUndefined();
    expect(commands.setCallEndEnabled).not.toHaveBeenCalled();
  });
});
